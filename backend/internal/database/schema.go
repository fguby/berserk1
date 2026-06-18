package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

func EnsureSchema(ctx context.Context, pool *pgxpool.Pool) error {
	statements := []string{
		`create extension if not exists pgcrypto`,
		`create table if not exists users (
			id uuid primary key default gen_random_uuid(),
			app_id text not null default 'berserk.web',
			email text not null default '',
			email_normalized text not null default '',
			password_hash text not null default '',
			display_name text not null default '',
			avatar_url text not null default '',
			signature text not null default '',
			gender text not null default '',
			invite_code text not null default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now(),
			unique (app_id, email_normalized)
		)`,
		`alter table users add column if not exists invite_code text not null default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))`,
		`update users set invite_code = lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)) where invite_code = ''`,
		`create unique index if not exists users_id_idx on users (id)`,
		`create unique index if not exists users_app_id_email_normalized_idx on users (app_id, email_normalized)`,
		`create unique index if not exists users_invite_code_idx on users (invite_code)`,
		`create table if not exists auth_sessions (
			token text primary key,
			user_id uuid not null references users(id) on delete cascade,
			app_id text not null default 'berserk.web',
			expires_at timestamptz not null,
			created_at timestamptz not null default now()
		)`,
		`create index if not exists auth_sessions_user_idx on auth_sessions (user_id)`,
		`create table if not exists email_auth_codes (
			id uuid primary key default gen_random_uuid(),
			app_id text not null default 'berserk.web',
			email text not null,
			purpose text not null,
			code_hash text not null,
			attempts integer not null default 0,
			expires_at timestamptz not null,
			verified_at timestamptz,
			verify_token_hash text not null default '',
			verify_token_expires_at timestamptz,
			consumed_at timestamptz,
			created_at timestamptz not null default now()
		)`,
		`alter table email_auth_codes add column if not exists verify_token_hash text not null default ''`,
		`alter table email_auth_codes add column if not exists verify_token_expires_at timestamptz`,
		`alter table email_auth_codes add column if not exists consumed_at timestamptz`,
		`create index if not exists email_auth_codes_lookup_idx on email_auth_codes (app_id, email, purpose, created_at desc)`,
		`create table if not exists user_credit_accounts (
			user_id uuid primary key references users(id) on delete cascade,
			balance integer not null default 0,
			total_recharged integer not null default 0,
			updated_at timestamptz not null default now()
		)`,
		`create unique index if not exists user_credit_accounts_user_id_idx on user_credit_accounts (user_id)`,
		`create table if not exists credit_ledger (
			id uuid primary key default gen_random_uuid(),
			user_id uuid not null references users(id) on delete cascade,
			delta integer not null,
			balance_after integer not null,
			reason text not null default '',
			ref_type text not null default '',
			ref_id text not null default '',
			created_at timestamptz not null default now()
		)`,
		`create index if not exists credit_ledger_user_created_idx on credit_ledger (user_id, created_at desc)`,
		`create unique index if not exists credit_ledger_image_pricing_adjustment_once_idx
			on credit_ledger (user_id, reason, ref_type, ref_id)
			where reason = 'image_pricing_adjustment_2026_05'`,
		`create unique index if not exists credit_ledger_referral_purchase_once_idx
			on credit_ledger (user_id, reason, ref_type, ref_id)
			where reason = 'referral_purchase_bonus'`,
		`create table if not exists user_referrals (
			id uuid primary key default gen_random_uuid(),
			inviter_user_id uuid not null references users(id) on delete cascade,
			invitee_user_id uuid not null references users(id) on delete cascade,
			invitee_ip_hash text not null default '',
			registration_bonus_credits integer not null default 0,
			purchase_bonus_credits integer not null default 0,
			created_at timestamptz not null default now(),
			unique (invitee_user_id)
		)`,
		`create index if not exists user_referrals_inviter_idx on user_referrals (inviter_user_id, created_at desc)`,
		`create unique index if not exists user_referrals_registration_ip_once_idx
			on user_referrals (invitee_ip_hash)
			where invitee_ip_hash <> '' and registration_bonus_credits > 0`,
		`create table if not exists credit_orders (
			id uuid primary key default gen_random_uuid(),
			user_id uuid not null references users(id) on delete cascade,
			package_id text not null,
			credits integer not null,
			amount_cents integer not null,
			currency text not null default 'CNY',
			status text not null default 'pending',
			provider text not null default 'card_key',
			created_at timestamptz not null default now(),
			paid_at timestamptz
		)`,
		`alter table credit_orders add column if not exists out_trade_no text not null default ''`,
		`alter table credit_orders add column if not exists provider_trade_no text not null default ''`,
		`alter table credit_orders add column if not exists paid_amount_cents integer not null default 0`,
		`alter table credit_orders add column if not exists failed_reason text not null default ''`,
		`alter table credit_orders add column if not exists expired_at timestamptz`,
		`alter table credit_orders add column if not exists updated_at timestamptz not null default now()`,
		`create unique index if not exists credit_orders_out_trade_no_idx
			on credit_orders (out_trade_no)
			where out_trade_no <> ''`,
		`create index if not exists credit_orders_user_created_idx on credit_orders (user_id, created_at desc)`,
		`create table if not exists alipay_notifications (
			id uuid primary key default gen_random_uuid(),
			out_trade_no text not null,
			trade_no text not null default '',
			trade_status text not null default '',
			total_amount text not null default '',
			raw_body text not null,
			verified boolean not null default false,
			processed boolean not null default false,
			error_message text not null default '',
			created_at timestamptz not null default now()
		)`,
		`create index if not exists alipay_notifications_out_trade_no_idx
			on alipay_notifications (out_trade_no, created_at desc)`,
		`create table if not exists credit_package_configs (
			package_id text primary key,
			name text not null,
			credits integer not null,
			amount_cents integer not null,
			currency text not null default 'CNY',
			icon text not null default '',
			payment_url text not null default '',
			enabled boolean not null default true,
			sort_order integer not null default 100,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now()
		)`,
		`create unique index if not exists credit_package_configs_package_id_idx on credit_package_configs (package_id)`,
		`insert into credit_package_configs (package_id, name, credits, amount_cents, currency, icon, payment_url, enabled, sort_order)
		values
			('credits_trial', '限时体验包', 10, 100, 'CNY', '/pricing-icons/package-trial.png', '', true, 5),
			('credits_100', '灵感入门包', 110, 1000, 'CNY', '/pricing-icons/package-100.png', '', true, 10),
			('credits_500', '创作加速包', 550, 4900, 'CNY', '/pricing-icons/package-500.png', '', true, 20),
			('credits_1000', '高频创作包', 1100, 9500, 'CNY', '/pricing-icons/package-1000.png', '', true, 30),
			('credits_5000', '工作室储备包', 5000, 45000, 'CNY', '/pricing-icons/credits-5000.png', '', false, 40)
		on conflict (package_id) do update set
			name = excluded.name,
			credits = excluded.credits,
			amount_cents = excluded.amount_cents,
			currency = excluded.currency,
			icon = excluded.icon,
			enabled = excluded.enabled,
			sort_order = excluded.sort_order,
			updated_at = now()`,
		`create table if not exists credit_redeem_codes (
			code text primary key,
			package_id text not null default '',
			credits integer not null,
			password_hash text not null default '',
			status text not null default 'unused',
			redeemed_by uuid references users(id) on delete set null,
			redeemed_at timestamptz,
			created_at timestamptz not null default now()
		)`,
		`alter table credit_redeem_codes add column if not exists password_hash text not null default ''`,
		`update credit_redeem_codes set credits = case package_id
			when 'credits_trial' then 10
			when 'credits_100' then 110
			when 'credits_500' then 550
			when 'credits_1000' then 1100
			else credits
		end
		where status = 'unused'
			and package_id in ('credits_trial', 'credits_100', 'credits_500', 'credits_1000')`,
		`create table if not exists image_models (
			id text primary key,
			name text not null,
			provider text not null default '',
			description text not null default '',
			credit_cost integer not null default 3,
			enabled boolean not null default true,
			sort_order integer not null default 100,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now()
		)`,
		`create unique index if not exists image_models_id_idx on image_models (id)`,
		`insert into image_models (id, name, provider, description, credit_cost, enabled, sort_order)
		values
			('gpt-image', 'GPT Image', 'OpenAI', '通用商业海报与插画', 3, true, 10),
			('seedream', 'Seedream', 'ByteDance', '中文提示词友好', 3, true, 20),
			('qwen-image', 'Qwen Image', 'Alibaba', '产品图与中文排版', 3, true, 30),
			('gemini-image', 'Gemini Image', 'Google', '多模态参考图创作', 3, true, 40)
		on conflict (id) do update set
			name = excluded.name,
			provider = excluded.provider,
			description = excluded.description,
			credit_cost = excluded.credit_cost,
			updated_at = now()`,
		`create table if not exists web_gallery_images (
			id uuid primary key default gen_random_uuid(),
			user_id uuid references users(id) on delete set null,
			prompt text not null default '',
			style text not null default '',
			model_id text not null default '',
			model_name text not null default '',
			image_data text not null default '',
			mime_type text not null default 'image/png',
			size text not null default '',
			quality text not null default '',
			credits_cost integer not null default 0,
			is_public boolean not null default false,
			is_featured boolean not null default false,
			is_prompt_featured boolean not null default false,
			created_at timestamptz not null default now()
		)`,
		`alter table web_gallery_images add column if not exists is_public boolean not null default false`,
		`alter table web_gallery_images add column if not exists is_featured boolean not null default false`,
		`alter table web_gallery_images add column if not exists is_prompt_featured boolean not null default false`,
		`alter table web_gallery_images add column if not exists credits_cost integer not null default 0`,
		`create index if not exists web_gallery_images_public_created_idx on web_gallery_images (is_public, is_featured, created_at desc)`,
		`create table if not exists web_gallery_image_likes (
			image_id uuid not null references web_gallery_images(id) on delete cascade,
			user_id uuid not null references users(id) on delete cascade,
			created_at timestamptz not null default now(),
			primary key (image_id, user_id)
		)`,
		`create unique index if not exists web_gallery_image_likes_image_user_idx on web_gallery_image_likes (image_id, user_id)`,
		`create index if not exists web_gallery_image_likes_image_idx on web_gallery_image_likes (image_id)`,
		`create table if not exists web_gallery_image_favorites (
			image_id uuid not null references web_gallery_images(id) on delete cascade,
			user_id uuid not null references users(id) on delete cascade,
			created_at timestamptz not null default now(),
			primary key (image_id, user_id)
		)`,
		`create unique index if not exists web_gallery_image_favorites_image_user_idx on web_gallery_image_favorites (image_id, user_id)`,
		`create index if not exists web_gallery_image_favorites_user_created_idx on web_gallery_image_favorites (user_id, created_at desc)`,
		`create index if not exists web_gallery_image_favorites_image_idx on web_gallery_image_favorites (image_id)`,
		`create table if not exists web_image_tasks (
			id uuid primary key default gen_random_uuid(),
			user_id uuid not null references users(id) on delete cascade,
			prompt text not null default '',
			style text not null default '',
			model_id text not null default '',
			model_name text not null default '',
			size text not null default '1024x1536',
			quality text not null default 'medium',
			n integer not null default 1,
			credits_cost integer not null default 0,
			status text not null default 'queued',
			error_message text not null default '',
			result_image_data text not null default '',
			result_mime_type text not null default '',
			gallery_image_id uuid references web_gallery_images(id) on delete set null,
			is_public boolean not null default false,
			created_at timestamptz not null default now(),
			started_at timestamptz,
			completed_at timestamptz,
			updated_at timestamptz not null default now()
		)`,
		`alter table web_image_tasks add column if not exists is_public boolean not null default false`,
		`alter table web_image_tasks add column if not exists gallery_image_id uuid references web_gallery_images(id) on delete set null`,
		`alter table web_image_tasks add column if not exists result_image_data text not null default ''`,
		`alter table web_image_tasks add column if not exists result_mime_type text not null default ''`,
		`create unique index if not exists web_image_tasks_one_active_per_user_idx
			on web_image_tasks (user_id)
			where status in ('queued', 'running')`,
		`create index if not exists web_image_tasks_user_created_idx on web_image_tasks (user_id, created_at desc)`,
		`alter table web_gallery_images alter column is_public set default false`,
		`alter table web_image_tasks alter column is_public set default false`,
		`create table if not exists comic_works (
			id uuid primary key default gen_random_uuid(),
			user_id uuid not null references users(id) on delete cascade,
			title text not null default '',
			subtitle text not null default '',
			cover text not null default '',
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now()
		)`,
		`alter table comic_works add column if not exists subtitle text not null default ''`,
		`alter table comic_works add column if not exists cover text not null default ''`,
		`alter table comic_works add column if not exists updated_at timestamptz not null default now()`,
		`create index if not exists comic_works_user_updated_idx on comic_works (user_id, updated_at desc)`,
		`create table if not exists comic_episodes (
			id uuid primary key default gen_random_uuid(),
			work_id uuid not null references comic_works(id) on delete cascade,
			title text not null default '',
			status text not null default '草稿',
			summary text not null default '',
			sort_order integer not null default 0,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now()
		)`,
		`alter table comic_episodes add column if not exists status text not null default '草稿'`,
		`alter table comic_episodes add column if not exists summary text not null default ''`,
		`alter table comic_episodes add column if not exists sort_order integer not null default 0`,
		`alter table comic_episodes add column if not exists updated_at timestamptz not null default now()`,
		`create index if not exists comic_episodes_work_sort_idx on comic_episodes (work_id, sort_order, created_at)`,
		`create table if not exists comic_pages (
			id uuid primary key default gen_random_uuid(),
			episode_id uuid not null references comic_episodes(id) on delete cascade,
			title text not null default '',
			thumb text not null default '',
			status text not null default '草稿',
			sort_order integer not null default 0,
			script_beats jsonb not null default '[]'::jsonb,
			panels jsonb not null default '[]'::jsonb,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now()
		)`,
		`alter table comic_pages add column if not exists thumb text not null default ''`,
		`alter table comic_pages add column if not exists status text not null default '草稿'`,
		`alter table comic_pages add column if not exists sort_order integer not null default 0`,
		`alter table comic_pages add column if not exists script_beats jsonb not null default '[]'::jsonb`,
		`alter table comic_pages add column if not exists panels jsonb not null default '[]'::jsonb`,
		`alter table comic_pages add column if not exists updated_at timestamptz not null default now()`,
		`create index if not exists comic_pages_episode_sort_idx on comic_pages (episode_id, sort_order, created_at)`,
		`create table if not exists comic_assets (
			id uuid primary key default gen_random_uuid(),
			user_id uuid not null references users(id) on delete cascade,
			work_id uuid references comic_works(id) on delete cascade,
			type text not null default '人物',
			title text not null default '',
			prompt text not null default '',
			src text not null default '',
			favorite boolean not null default false,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now()
		)`,
		`alter table comic_assets add column if not exists work_id uuid references comic_works(id) on delete cascade`,
		`alter table comic_assets add column if not exists type text not null default '人物'`,
		`alter table comic_assets add column if not exists prompt text not null default ''`,
		`alter table comic_assets add column if not exists src text not null default ''`,
		`alter table comic_assets add column if not exists favorite boolean not null default false`,
		`alter table comic_assets add column if not exists updated_at timestamptz not null default now()`,
		`create index if not exists comic_assets_user_work_type_idx on comic_assets (user_id, work_id, type, updated_at desc)`,
		`create index if not exists comic_assets_user_favorite_idx on comic_assets (user_id, favorite, updated_at desc)`,
	}
	for index, statement := range statements {
		if _, err := pool.Exec(ctx, statement); err != nil {
			return fmt.Errorf("run schema statement %d: %w", index+1, err)
		}
	}
	return nil
}

package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"time"

	"pianke-ticket/backend/internal/models"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("not found")
var ErrConflict = errors.New("conflict")
var ErrInsufficientCredits = errors.New("insufficient credits")

const (
	imagePricingAdjustmentReason        = "image_pricing_adjustment_2026_05"
	imagePricingAdjustmentRefType       = "pricing_adjustment"
	imagePricingAdjustmentRefID         = "image_cost_5_to_3"
	imagePricingAdjustmentOldCreditCost = 5
	imagePricingAdjustmentNewCreditCost = 3
	referralRegistrationBonusCredits    = 10
	referralPurchaseBonusRate           = 10
)

type BerserkStore interface {
	CreateEmailUser(ctx context.Context, appID string, email string, passwordHash string) (models.User, error)
	GetEmailUser(ctx context.Context, appID string, email string) (models.User, error)
	GetEmailPasswordHash(ctx context.Context, appID string, email string) (string, error)
	SetEmailUserPassword(ctx context.Context, appID string, email string, passwordHash string) error
	SaveEmailCode(ctx context.Context, appID string, email string, purpose string, codeHash string, expiresAt time.Time) error
	VerifyEmailCode(ctx context.Context, appID string, email string, purpose string, codeHash string, verifyTokenHash string, verifyTokenExpiresAt time.Time) error
	ConsumeVerifiedEmailCode(ctx context.Context, appID string, email string, purpose string, verifyTokenHash string) error
	ConsumeEmailCode(ctx context.Context, appID string, email string, purpose string, codeHash string) error
	CreateSession(ctx context.Context, userID string, expiresAt time.Time) (string, error)
	GetUserBySession(ctx context.Context, token string) (models.User, error)
	GetUser(ctx context.Context, userID string) (models.User, error)
	UpdateUserProfile(ctx context.Context, userID string, request models.UserProfileUpdateRequest) (models.User, error)
	DeleteUser(ctx context.Context, userID string) error
	AddCredits(ctx context.Context, userID string, delta int, reason string, refType string, refID string) (int, error)
	ConsumeCredits(ctx context.Context, userID string, amount int, reason string, refType string, refID string) (int, error)
	ApplyImagePricingCompensation(ctx context.Context, userID string) (models.CreditAdjustmentNotice, error)
	GetReferralSummary(ctx context.Context, userID string) (models.ReferralSummary, error)
	ApplyReferralRegistration(ctx context.Context, inviterCode string, inviteeUserID string, inviteeIP string) error
	CreateCreditOrder(ctx context.Context, userID string, pkg models.CreditPackage) (models.CreditOrder, error)
	ListCreditPackages(ctx context.Context) ([]models.CreditPackage, error)
	RedeemCreditCode(ctx context.Context, userID string, cardNo string, password string) (int, error)
	ListImageModels(ctx context.Context) ([]models.ImageModel, error)
	GetImageModel(ctx context.Context, modelID string) (models.ImageModel, error)
	CreateGalleryImages(ctx context.Context, userID string, prompt string, style string, modelID string, modelName string, size string, quality string, creditsCost int, isPublic bool, images []models.WebGeneratedImage) ([]models.WebGalleryImage, error)
	ListGalleryImages(ctx context.Context, userID string, limit int, before string, query string, sortMode string) ([]models.WebGalleryImage, error)
	ListFavoriteGalleryImages(ctx context.Context, userID string, limit int, before string, query string, sortMode string) ([]models.WebGalleryImage, error)
	SetGalleryImageLike(ctx context.Context, userID string, id string, liked bool) (models.WebGalleryImage, error)
	SetGalleryImageFavorite(ctx context.Context, userID string, id string, favorited bool) (models.WebGalleryImage, error)
	SetGalleryImageFeatured(ctx context.Context, userID string, id string, featured bool, promptFeatured bool) (models.WebGalleryImage, error)
	HasActiveWebImageTask(ctx context.Context, userID string) (bool, error)
	CreateWebImageTask(ctx context.Context, userID string, prompt string, style string, modelID string, size string, quality string, n int, creditsCost int, isPublic bool) (models.WebImageTask, error)
	ListWebImageTasks(ctx context.Context, userID string, limit int) ([]models.WebImageTask, error)
	GetWebImageTask(ctx context.Context, userID string, id string) (models.WebImageTask, error)
	MarkWebImageTaskRunning(ctx context.Context, userID string, id string) error
	CompleteWebImageTask(ctx context.Context, userID string, id string, result models.WebGeneratedImage, galleryID string) (models.WebImageTask, error)
	FailWebImageTask(ctx context.Context, userID string, id string, errorMessage string) (models.WebImageTask, error)
	SetWebImageTaskPublic(ctx context.Context, userID string, id string, isPublic bool) (models.WebImageTask, error)
}

type Postgres struct {
	pool *pgxpool.Pool
}

func NewPostgres(pool *pgxpool.Pool) *Postgres {
	return &Postgres{pool: pool}
}

func (p *Postgres) CreateEmailUser(ctx context.Context, appID string, email string, passwordHash string) (models.User, error) {
	email = normalizeEmail(email)
	var userID string
	err := p.pool.QueryRow(ctx, `
		insert into users (app_id, email, email_normalized, password_hash, display_name)
		values ($1, $2, $2, $3, $2)
		on conflict (app_id, email_normalized) do nothing
		returning id::text
	`, appID, email, passwordHash).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.User{}, ErrConflict
	}
	if err != nil {
		return models.User{}, err
	}
	return p.GetUser(ctx, userID)
}

func (p *Postgres) GetEmailUser(ctx context.Context, appID string, email string) (models.User, error) {
	return p.scanUser(ctx, `
		select u.id::text, u.app_id, u.email, u.display_name, u.avatar_url, u.signature, u.gender, u.invite_code,
			coalesce(a.balance, 0), coalesce(a.total_recharged, 0), u.created_at
		from users u
		left join user_credit_accounts a on a.user_id = u.id
		where u.app_id = $1 and u.email_normalized = $2
	`, appID, normalizeEmail(email))
}

func (p *Postgres) GetEmailPasswordHash(ctx context.Context, appID string, email string) (string, error) {
	var passwordHash string
	err := p.pool.QueryRow(ctx, `
		select password_hash from users where app_id = $1 and email_normalized = $2
	`, appID, normalizeEmail(email)).Scan(&passwordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return passwordHash, err
}

func (p *Postgres) SetEmailUserPassword(ctx context.Context, appID string, email string, passwordHash string) error {
	tag, err := p.pool.Exec(ctx, `
		update users set password_hash = $3, updated_at = now()
		where app_id = $1 and email_normalized = $2
	`, appID, normalizeEmail(email), passwordHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (p *Postgres) SaveEmailCode(ctx context.Context, appID string, email string, purpose string, codeHash string, expiresAt time.Time) error {
	_, err := p.pool.Exec(ctx, `
		update email_auth_codes
		set consumed_at = now()
		where app_id = $1 and email = $2 and purpose = $3 and consumed_at is null
			and expires_at <= now()
	`, appID, normalizeEmail(email), purpose)
	if err != nil {
		return err
	}
	_, err = p.pool.Exec(ctx, `
		insert into email_auth_codes (app_id, email, purpose, code_hash, expires_at)
		values ($1, $2, $3, $4, $5)
	`, appID, normalizeEmail(email), purpose, codeHash, expiresAt)
	return err
}

func (p *Postgres) VerifyEmailCode(ctx context.Context, appID string, email string, purpose string, codeHash string, verifyTokenHash string, verifyTokenExpiresAt time.Time) error {
	_ = appID
	tag, err := p.pool.Exec(ctx, `
		update email_auth_codes
		set verified_at = now(), verify_token_hash = $4, verify_token_expires_at = $5
		where id = (
			select id from email_auth_codes
			where email = $1 and purpose = $2 and code_hash = $3
				and consumed_at is null and expires_at > now()
			order by created_at desc
			limit 1
		)
	`, normalizeEmail(email), purpose, codeHash, verifyTokenHash, verifyTokenExpiresAt)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (p *Postgres) ConsumeVerifiedEmailCode(ctx context.Context, appID string, email string, purpose string, verifyTokenHash string) error {
	_ = appID
	tag, err := p.pool.Exec(ctx, `
		update email_auth_codes
		set consumed_at = now()
		where id = (
			select id from email_auth_codes
			where email = $1 and purpose = $2 and verify_token_hash = $3
				and verified_at is not null and consumed_at is null and verify_token_expires_at > now()
			order by verified_at desc
			limit 1
		)
	`, normalizeEmail(email), purpose, verifyTokenHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (p *Postgres) ConsumeEmailCode(ctx context.Context, appID string, email string, purpose string, codeHash string) error {
	_ = appID
	tag, err := p.pool.Exec(ctx, `
		update email_auth_codes
		set consumed_at = now()
		where id = (
			select id from email_auth_codes
			where email = $1 and purpose = $2 and code_hash = $3
				and consumed_at is null and expires_at > now()
			order by created_at desc
			limit 1
		)
	`, normalizeEmail(email), purpose, codeHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (p *Postgres) CreateSession(ctx context.Context, userID string, expiresAt time.Time) (string, error) {
	token, err := randomToken(32)
	if err != nil {
		return "", err
	}
	_, err = p.pool.Exec(ctx, `
		insert into auth_sessions (token, user_id, app_id, expires_at)
		select $1, id, app_id, $3 from users where id = $2::uuid
	`, token, userID, expiresAt)
	return token, err
}

func (p *Postgres) GetUserBySession(ctx context.Context, token string) (models.User, error) {
	return p.scanUser(ctx, `
		select u.id::text, u.app_id, u.email, u.display_name, u.avatar_url, u.signature, u.gender, u.invite_code,
			coalesce(a.balance, 0), coalesce(a.total_recharged, 0), u.created_at
		from auth_sessions s
		join users u on u.id = s.user_id
		left join user_credit_accounts a on a.user_id = u.id
		where s.token = $1 and s.expires_at > now()
	`, token)
}

func (p *Postgres) GetUser(ctx context.Context, userID string) (models.User, error) {
	return p.scanUser(ctx, `
		select u.id::text, u.app_id, u.email, u.display_name, u.avatar_url, u.signature, u.gender, u.invite_code,
			coalesce(a.balance, 0), coalesce(a.total_recharged, 0), u.created_at
		from users u
		left join user_credit_accounts a on a.user_id = u.id
		where u.id = $1::uuid
	`, userID)
}

func (p *Postgres) UpdateUserProfile(ctx context.Context, userID string, request models.UserProfileUpdateRequest) (models.User, error) {
	tag, err := p.pool.Exec(ctx, `
		update users
		set display_name = case when $2 <> '' then $2 else display_name end,
			avatar_url = $3,
			signature = $4,
			gender = $5,
			updated_at = now()
		where id = $1::uuid
	`, userID, strings.TrimSpace(request.DisplayName), strings.TrimSpace(request.AvatarURL), strings.TrimSpace(request.Signature), strings.TrimSpace(request.Gender))
	if err != nil {
		return models.User{}, err
	}
	if tag.RowsAffected() == 0 {
		return models.User{}, ErrNotFound
	}
	return p.GetUser(ctx, userID)
}

func (p *Postgres) DeleteUser(ctx context.Context, userID string) error {
	tag, err := p.pool.Exec(ctx, `delete from users where id = $1::uuid`, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (p *Postgres) AddCredits(ctx context.Context, userID string, delta int, reason string, refType string, refID string) (int, error) {
	if delta == 0 {
		user, err := p.GetUser(ctx, userID)
		return user.Credits, err
	}
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	var balance int
	err = tx.QueryRow(ctx, `
		insert into user_credit_accounts (user_id, balance, total_recharged)
		values ($1::uuid, $2, greatest($2, 0))
		on conflict (user_id) do update set
			balance = user_credit_accounts.balance + excluded.balance,
			total_recharged = user_credit_accounts.total_recharged + greatest(excluded.balance, 0),
			updated_at = now()
		returning balance
	`, userID, delta).Scan(&balance)
	if err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `
		insert into credit_ledger (user_id, delta, balance_after, reason, ref_type, ref_id)
		values ($1::uuid, $2, $3, $4, $5, $6)
	`, userID, delta, balance, strings.TrimSpace(reason), strings.TrimSpace(refType), strings.TrimSpace(refID)); err != nil {
		return 0, err
	}
	return balance, tx.Commit(ctx)
}

func (p *Postgres) ConsumeCredits(ctx context.Context, userID string, amount int, reason string, refType string, refID string) (int, error) {
	if amount <= 0 {
		user, err := p.GetUser(ctx, userID)
		return user.Credits, err
	}
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	var balance int
	err = tx.QueryRow(ctx, `
		update user_credit_accounts
		set balance = balance - $2, updated_at = now()
		where user_id = $1::uuid and balance >= $2
		returning balance
	`, userID, amount).Scan(&balance)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrInsufficientCredits
	}
	if err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `
		insert into credit_ledger (user_id, delta, balance_after, reason, ref_type, ref_id)
		values ($1::uuid, $2, $3, $4, $5, $6)
	`, userID, -amount, balance, strings.TrimSpace(reason), strings.TrimSpace(refType), strings.TrimSpace(refID)); err != nil {
		return 0, err
	}
	return balance, tx.Commit(ctx)
}

func (p *Postgres) ApplyImagePricingCompensation(ctx context.Context, userID string) (models.CreditAdjustmentNotice, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return models.CreditAdjustmentNotice{}, ErrNotFound
	}
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return models.CreditAdjustmentNotice{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		insert into user_credit_accounts (user_id, balance, total_recharged)
		values ($1::uuid, 0, 0)
		on conflict (user_id) do nothing
	`, userID); err != nil {
		return models.CreditAdjustmentNotice{}, err
	}

	var currentBalance int
	if err := tx.QueryRow(ctx, `
		select balance from user_credit_accounts
		where user_id = $1::uuid
		for update
	`, userID).Scan(&currentBalance); err != nil {
		return models.CreditAdjustmentNotice{}, err
	}

	existing, err := p.imagePricingCompensationLedger(ctx, tx, userID)
	if err != nil {
		return models.CreditAdjustmentNotice{}, err
	}
	if existing.Amount > 0 {
		if err := tx.Commit(ctx); err != nil {
			return models.CreditAdjustmentNotice{}, err
		}
		return existing, nil
	}

	var amount int
	if err := tx.QueryRow(ctx, `
		select coalesce(sum(greatest(credits_cost - $2, 0)), 0)::int
		from web_gallery_images
		where user_id = $1::uuid and credits_cost > $2
	`, userID, imagePricingAdjustmentNewCreditCost).Scan(&amount); err != nil {
		return models.CreditAdjustmentNotice{}, err
	}
	if amount <= 0 {
		if err := tx.Commit(ctx); err != nil {
			return models.CreditAdjustmentNotice{}, err
		}
		return models.CreditAdjustmentNotice{}, nil
	}

	balanceAfter := currentBalance + amount
	var inserted bool
	err = tx.QueryRow(ctx, `
		insert into credit_ledger (user_id, delta, balance_after, reason, ref_type, ref_id)
		values ($1::uuid, $2, $3, $4, $5, $6)
		on conflict (user_id, reason, ref_type, ref_id)
		where reason = 'image_pricing_adjustment_2026_05'
		do nothing
		returning true
	`, userID, amount, balanceAfter, imagePricingAdjustmentReason, imagePricingAdjustmentRefType, imagePricingAdjustmentRefID).Scan(&inserted)
	if errors.Is(err, pgx.ErrNoRows) {
		existing, lookupErr := p.imagePricingCompensationLedger(ctx, tx, userID)
		if lookupErr != nil {
			return models.CreditAdjustmentNotice{}, lookupErr
		}
		if err := tx.Commit(ctx); err != nil {
			return models.CreditAdjustmentNotice{}, err
		}
		return existing, nil
	}
	if err != nil {
		return models.CreditAdjustmentNotice{}, err
	}
	if _, err := tx.Exec(ctx, `
		update user_credit_accounts
		set balance = $2, updated_at = now()
		where user_id = $1::uuid
	`, userID, balanceAfter); err != nil {
		return models.CreditAdjustmentNotice{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return models.CreditAdjustmentNotice{}, err
	}
	return imagePricingCompensationNotice(amount), nil
}

type ledgerQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func (p *Postgres) imagePricingCompensationLedger(ctx context.Context, q ledgerQuerier, userID string) (models.CreditAdjustmentNotice, error) {
	var amount int
	err := q.QueryRow(ctx, `
		select delta
		from credit_ledger
		where user_id = $1::uuid and reason = $2 and ref_type = $3 and ref_id = $4 and delta > 0
		order by created_at desc
		limit 1
	`, userID, imagePricingAdjustmentReason, imagePricingAdjustmentRefType, imagePricingAdjustmentRefID).Scan(&amount)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.CreditAdjustmentNotice{}, nil
	}
	if err != nil {
		return models.CreditAdjustmentNotice{}, err
	}
	return imagePricingCompensationNotice(amount), nil
}

func imagePricingCompensationNotice(amount int) models.CreditAdjustmentNotice {
	if amount <= 0 {
		return models.CreditAdjustmentNotice{}
	}
	return models.CreditAdjustmentNotice{
		ID:            imagePricingAdjustmentReason,
		Amount:        amount,
		OldCreditCost: imagePricingAdjustmentOldCreditCost,
		NewCreditCost: imagePricingAdjustmentNewCreditCost,
		Title:         "积分已补偿到账",
		Message:       "图片生成价格已从 5 积分/张调整为 3 积分/张。系统已按历史成功出图记录为你补回差额积分，可直接用于后续创作。",
	}
}

func (p *Postgres) GetReferralSummary(ctx context.Context, userID string) (models.ReferralSummary, error) {
	var summary models.ReferralSummary
	err := p.pool.QueryRow(ctx, `
		select u.invite_code,
			(select count(*)::int from user_referrals r where r.inviter_user_id = u.id),
			(select coalesce(sum(r.registration_bonus_credits + r.purchase_bonus_credits), 0)::int from user_referrals r where r.inviter_user_id = u.id)
		from users u
		where u.id = $1::uuid
	`, userID).Scan(&summary.InviteCode, &summary.UsedCount, &summary.RewardCredits)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.ReferralSummary{}, ErrNotFound
	}
	if err != nil {
		return models.ReferralSummary{}, err
	}
	summary.RegistrationRewardCredits = referralRegistrationBonusCredits
	summary.PurchaseRewardRate = referralPurchaseBonusRate
	return summary, nil
}

func (p *Postgres) ApplyReferralRegistration(ctx context.Context, inviterCode string, inviteeUserID string, inviteeIP string) error {
	inviterCode = strings.TrimSpace(inviterCode)
	if inviterCode == "" || strings.TrimSpace(inviteeUserID) == "" {
		return nil
	}
	ipHash := referralIPHash(inviteeIP)
	if ipHash == "" {
		return nil
	}
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var inviterID string
	err = tx.QueryRow(ctx, `
		select id::text
		from users
		where invite_code = $1 and id <> $2::uuid
	`, inviterCode, inviteeUserID).Scan(&inviterID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}

	var duplicateIP bool
	if err := tx.QueryRow(ctx, `
		select exists (
			select 1
			from user_referrals
			where invitee_ip_hash = $1 and registration_bonus_credits > 0
		)
	`, ipHash).Scan(&duplicateIP); err != nil {
		return err
	}
	if duplicateIP {
		return nil
	}

	var referralID string
	err = tx.QueryRow(ctx, `
		insert into user_referrals (inviter_user_id, invitee_user_id, invitee_ip_hash, registration_bonus_credits)
		values ($1::uuid, $2::uuid, $3, $4)
		on conflict (invitee_user_id) do nothing
		returning id::text
	`, inviterID, inviteeUserID, ipHash, referralRegistrationBonusCredits).Scan(&referralID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		if strings.Contains(err.Error(), "user_referrals_registration_ip_once_idx") {
			return nil
		}
		return err
	}

	var balance int
	if err := tx.QueryRow(ctx, `
		insert into user_credit_accounts (user_id, balance, total_recharged)
		values ($1::uuid, $2, 0)
		on conflict (user_id) do update set
			balance = user_credit_accounts.balance + excluded.balance,
			updated_at = now()
		returning balance
	`, inviterID, referralRegistrationBonusCredits).Scan(&balance); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		insert into credit_ledger (user_id, delta, balance_after, reason, ref_type, ref_id)
		values ($1::uuid, $2, $3, 'referral_registration_bonus', 'user_referral', $4)
	`, inviterID, referralRegistrationBonusCredits, balance, referralID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (p *Postgres) CreateCreditOrder(ctx context.Context, userID string, pkg models.CreditPackage) (models.CreditOrder, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return models.CreditOrder{}, err
	}
	defer tx.Rollback(ctx)
	var order models.CreditOrder
	err = tx.QueryRow(ctx, `
		insert into credit_orders (user_id, package_id, credits, amount_cents, currency, status, provider, paid_at)
		values ($1::uuid, $2, $3, $4, $5, 'paid', 'manual', now())
		returning id::text, user_id::text, package_id, credits, amount_cents, currency, status, provider, created_at, paid_at
	`, userID, pkg.ID, pkg.Credits, pkg.AmountCents, pkg.Currency).Scan(
		&order.ID, &order.UserID, &order.PackageID, &order.Credits, &order.AmountCents, &order.Currency, &order.Status, &order.Provider, &order.CreatedAt, &order.PaidAt,
	)
	if err != nil {
		return models.CreditOrder{}, err
	}
	var balance int
	if err := tx.QueryRow(ctx, `
		insert into user_credit_accounts (user_id, balance, total_recharged)
		values ($1::uuid, $2, $2)
		on conflict (user_id) do update set
			balance = user_credit_accounts.balance + excluded.balance,
			total_recharged = user_credit_accounts.total_recharged + excluded.balance,
			updated_at = now()
		returning balance
	`, userID, pkg.Credits).Scan(&balance); err != nil {
		return models.CreditOrder{}, err
	}
	if _, err := tx.Exec(ctx, `
		insert into credit_ledger (user_id, delta, balance_after, reason, ref_type, ref_id)
		values ($1::uuid, $2, $3, 'purchase', 'credit_order', $4)
	`, userID, pkg.Credits, balance, order.ID); err != nil {
		return models.CreditOrder{}, err
	}
	if err := p.applyReferralPurchaseBonus(ctx, tx, userID, "credit_order", order.ID, pkg.Credits); err != nil {
		return models.CreditOrder{}, err
	}
	return order, tx.Commit(ctx)
}

func (p *Postgres) applyReferralPurchaseBonus(ctx context.Context, tx pgx.Tx, inviteeUserID string, refType string, refID string, purchasedCredits int) error {
	if purchasedCredits <= 0 {
		return nil
	}
	bonusCredits := purchasedCredits * referralPurchaseBonusRate / 100
	if bonusCredits <= 0 {
		return nil
	}
	var referralID string
	var inviterID string
	err := tx.QueryRow(ctx, `
		select id::text, inviter_user_id::text
		from user_referrals
		where invitee_user_id = $1::uuid and registration_bonus_credits > 0
	`, inviteeUserID).Scan(&referralID, &inviterID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	var exists bool
	if err := tx.QueryRow(ctx, `
		select exists (
			select 1
			from credit_ledger
			where user_id = $1::uuid and reason = 'referral_purchase_bonus' and ref_type = $2 and ref_id = $3
		)
	`, inviterID, refType, refID).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}
	var balance int
	if err := tx.QueryRow(ctx, `
		insert into user_credit_accounts (user_id, balance, total_recharged)
		values ($1::uuid, $2, 0)
		on conflict (user_id) do update set
			balance = user_credit_accounts.balance + excluded.balance,
			updated_at = now()
		returning balance
	`, inviterID, bonusCredits).Scan(&balance); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		insert into credit_ledger (user_id, delta, balance_after, reason, ref_type, ref_id)
		values ($1::uuid, $2, $3, 'referral_purchase_bonus', $4, $5)
	`, inviterID, bonusCredits, balance, refType, refID); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		update user_referrals
		set purchase_bonus_credits = purchase_bonus_credits + $2
		where id = $1::uuid
	`, referralID, bonusCredits)
	return err
}

func (p *Postgres) ListCreditPackages(ctx context.Context) ([]models.CreditPackage, error) {
	rows, err := p.pool.Query(ctx, `
		select package_id, name, credits, amount_cents, currency, icon, payment_url
		from credit_package_configs
		where enabled = true
		order by sort_order, credits
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []models.CreditPackage
	for rows.Next() {
		var item models.CreditPackage
		if err := rows.Scan(&item.ID, &item.Name, &item.Credits, &item.AmountCents, &item.Currency, &item.Icon, &item.PaymentURL); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (p *Postgres) RedeemCreditCode(ctx context.Context, userID string, cardNo string, password string) (int, error) {
	cardNo = strings.TrimSpace(cardNo)
	password = strings.TrimSpace(password)
	if cardNo == "" || password == "" {
		return 0, ErrNotFound
	}
	passwordHash := creditRedeemPasswordHash(cardNo, password)
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	var credits int
	err = tx.QueryRow(ctx, `
		update credit_redeem_codes
		set status = 'redeemed', redeemed_by = $2::uuid, redeemed_at = now()
		where lower(code) = lower($1) and password_hash = $3 and status = 'unused'
		returning credits
	`, cardNo, userID, passwordHash).Scan(&credits)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	if err != nil {
		return 0, err
	}
	var balance int
	if err := tx.QueryRow(ctx, `
		insert into user_credit_accounts (user_id, balance, total_recharged)
		values ($1::uuid, $2, $2)
		on conflict (user_id) do update set
			balance = user_credit_accounts.balance + excluded.balance,
			total_recharged = user_credit_accounts.total_recharged + excluded.balance,
			updated_at = now()
		returning balance
	`, userID, credits).Scan(&balance); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `
		insert into credit_ledger (user_id, delta, balance_after, reason, ref_type, ref_id)
		values ($1::uuid, $2, $3, 'redeem_code', 'credit_redeem_code', $4)
	`, userID, credits, balance, cardNo); err != nil {
		return 0, err
	}
	if err := p.applyReferralPurchaseBonus(ctx, tx, userID, "credit_redeem_code", strings.ToUpper(cardNo), credits); err != nil {
		return 0, err
	}
	return credits, tx.Commit(ctx)
}

func creditRedeemPasswordHash(cardNo string, password string) string {
	sum := sha256.Sum256([]byte(strings.ToUpper(strings.TrimSpace(cardNo)) + "|" + strings.TrimSpace(password)))
	return hex.EncodeToString(sum[:])
}

func referralIPHash(ip string) string {
	ip = strings.TrimSpace(strings.ToLower(ip))
	if ip == "" {
		return ""
	}
	sum := sha256.Sum256([]byte("referral-ip:" + ip))
	return hex.EncodeToString(sum[:])
}

func (p *Postgres) ListImageModels(ctx context.Context) ([]models.ImageModel, error) {
	rows, err := p.pool.Query(ctx, `
		select id, name, provider, description, credit_cost, enabled
		from image_models
		where enabled = true
		order by sort_order, credit_cost, name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []models.ImageModel
	for rows.Next() {
		var item models.ImageModel
		if err := rows.Scan(&item.ID, &item.Name, &item.Provider, &item.Description, &item.CreditCost, &item.Enabled); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (p *Postgres) GetImageModel(ctx context.Context, modelID string) (models.ImageModel, error) {
	modelID = strings.TrimSpace(modelID)
	if modelID == "" {
		modelID = "gpt-image"
	}
	var item models.ImageModel
	err := p.pool.QueryRow(ctx, `
		select id, name, provider, description, credit_cost, enabled
		from image_models
		where id = $1 and enabled = true
	`, modelID).Scan(&item.ID, &item.Name, &item.Provider, &item.Description, &item.CreditCost, &item.Enabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.ImageModel{}, ErrNotFound
	}
	return item, err
}

func (p *Postgres) CreateGalleryImages(ctx context.Context, userID string, prompt string, style string, modelID string, modelName string, size string, quality string, creditsCost int, isPublic bool, images []models.WebGeneratedImage) ([]models.WebGalleryImage, error) {
	if len(images) == 0 {
		return nil, nil
	}
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	items := make([]models.WebGalleryImage, 0, len(images))
	for _, image := range images {
		row := tx.QueryRow(ctx, `
			insert into web_gallery_images (user_id, prompt, style, model_id, model_name, image_data, mime_type, size, quality, credits_cost, is_public)
			values (nullif($1, '')::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
			returning id::text, coalesce(user_id::text, ''),
				coalesce((select display_name from users where id = nullif($1, '')::uuid), ''),
				coalesce((select avatar_url from users where id = nullif($1, '')::uuid), ''),
				image_data, prompt, style,
				coalesce(model_id, ''), coalesce(model_name, ''), mime_type, size, quality, credits_cost,
				is_public, is_featured, is_prompt_featured, 0, false, 0, false, created_at
		`, strings.TrimSpace(userID), prompt, style, modelID, modelName, image.URL, firstNonEmptyStore(image.MimeType, "image/png"), size, quality, creditsCost, isPublic)
		item, err := scanGalleryImage(row)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, tx.Commit(ctx)
}

func (p *Postgres) ListGalleryImages(ctx context.Context, userID string, limit int, before string, query string, sortMode string) ([]models.WebGalleryImage, error) {
	return p.listGalleryImages(ctx, userID, limit, before, false, query, sortMode)
}

func (p *Postgres) ListFavoriteGalleryImages(ctx context.Context, userID string, limit int, before string, query string, sortMode string) ([]models.WebGalleryImage, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, ErrNotFound
	}
	return p.listGalleryImages(ctx, userID, limit, before, true, query, sortMode)
}

func (p *Postgres) listGalleryImages(ctx context.Context, userID string, limit int, before string, favoritesOnly bool, query string, sortMode string) ([]models.WebGalleryImage, error) {
	if limit < 1 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	args := []any{limit, strings.TrimSpace(userID)}
	userParam := "$2"
	sortMode = normalizeGallerySortMode(sortMode)
	sortCountColumn := "0"
	sortOrder := "g.is_featured desc, g.created_at desc, g.id desc"
	if sortMode == "likes" {
		sortCountColumn = "coalesce(like_counts.like_count, 0)"
		sortOrder = "g.is_featured desc, coalesce(like_counts.like_count, 0) desc, g.created_at desc, g.id desc"
	} else if sortMode == "favorites" {
		sortCountColumn = "coalesce(favorite_counts.favorite_count, 0)"
		sortOrder = "g.is_featured desc, coalesce(favorite_counts.favorite_count, 0) desc, g.created_at desc, g.id desc"
	}
	cursorFilter := ""
	if strings.TrimSpace(before) != "" {
		args = []any{limit, strings.TrimSpace(before), strings.TrimSpace(userID)}
		userParam = "$3"
		if sortMode == "updated" {
			cursorFilter = `and exists (
				select 1 from web_gallery_images cursor_image
				where cursor_image.id::text = $2
				  and (
				    (g.is_featured = cursor_image.is_featured and (g.created_at, g.id) < (cursor_image.created_at, cursor_image.id))
				    or (cursor_image.is_featured = true and g.is_featured = false)
				  )
			)`
		} else {
			cursorRelation := "web_gallery_image_likes"
			if sortMode == "favorites" {
				cursorRelation = "web_gallery_image_favorites"
			}
			cursorFilter = `and exists (
				select 1, coalesce(cursor_counts.count_value, 0) as cursor_count
				from web_gallery_images cursor_image
				left join (
					select image_id, count(*)::int as count_value
					from ` + cursorRelation + `
					group by image_id
				) cursor_counts on cursor_counts.image_id = cursor_image.id
				where cursor_image.id::text = $2
				  and (
				    (g.is_featured = cursor_image.is_featured and (
				      ` + sortCountColumn + ` < coalesce(cursor_counts.count_value, 0)
				      or (` + sortCountColumn + ` = coalesce(cursor_counts.count_value, 0) and (g.created_at, g.id) < (cursor_image.created_at, cursor_image.id))
				    ))
				    or (cursor_image.is_featured = true and g.is_featured = false)
				  )
			)`
		}
	}
	favoriteFilter := ""
	if favoritesOnly {
		favoriteFilter = "and exists (select 1 from web_gallery_image_favorites fav where fav.image_id = g.id and fav.user_id = " + userParam + "::uuid)"
	}
	searchFilter := ""
	if strings.TrimSpace(query) != "" {
		args = append(args, "%"+strings.TrimSpace(query)+"%")
		searchFilter = "and (g.prompt ilike $" + strconv.Itoa(len(args)) + " or g.style ilike $" + strconv.Itoa(len(args)) + " or g.model_name ilike $" + strconv.Itoa(len(args)) + ")"
	}
	rows, err := p.pool.Query(ctx, `
		select g.id::text, coalesce(g.user_id::text, ''),
			coalesce(u.display_name, ''), coalesce(u.avatar_url, ''),
			g.image_data, g.prompt, g.style,
			coalesce(g.model_id, ''), coalesce(g.model_name, ''), g.mime_type, g.size, g.quality, g.credits_cost,
			g.is_public, g.is_featured, g.is_prompt_featured,
			coalesce(like_counts.like_count, 0),
			case when nullif(`+userParam+`, '') is null then false else exists (
				select 1 from web_gallery_image_likes likes
				where likes.image_id = g.id and likes.user_id = `+userParam+`::uuid
			) end as liked_by_me,
			coalesce(favorite_counts.favorite_count, 0),
			case when nullif(`+userParam+`, '') is null then false else exists (
				select 1 from web_gallery_image_favorites favorites
				where favorites.image_id = g.id and favorites.user_id = `+userParam+`::uuid
			) end as favorited_by_me,
			g.created_at
		from web_gallery_images g
		left join users u on u.id = g.user_id
		left join (
			select image_id, count(*)::int as like_count
			from web_gallery_image_likes
			group by image_id
		) like_counts on like_counts.image_id = g.id
		left join (
			select image_id, count(*)::int as favorite_count
			from web_gallery_image_favorites
			group by image_id
		) favorite_counts on favorite_counts.image_id = g.id
		where g.is_public = true `+cursorFilter+` `+favoriteFilter+` `+searchFilter+`
		order by `+sortOrder+`
		limit $1
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []models.WebGalleryImage
	for rows.Next() {
		item, err := scanGalleryImage(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func normalizeGallerySortMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "likes", "like", "like_count":
		return "likes"
	case "favorites", "favorite", "favorite_count", "fav":
		return "favorites"
	default:
		return "updated"
	}
}

func (p *Postgres) SetGalleryImageLike(ctx context.Context, userID string, id string, liked bool) (models.WebGalleryImage, error) {
	if liked {
		_, err := p.pool.Exec(ctx, `
			insert into web_gallery_image_likes (image_id, user_id)
			values ($1::uuid, $2::uuid)
			on conflict (image_id, user_id) do nothing
		`, id, userID)
		if err != nil {
			return models.WebGalleryImage{}, err
		}
	} else {
		if _, err := p.pool.Exec(ctx, `delete from web_gallery_image_likes where image_id = $1::uuid and user_id = $2::uuid`, id, userID); err != nil {
			return models.WebGalleryImage{}, err
		}
	}
	return p.getGalleryImage(ctx, userID, id)
}

func (p *Postgres) SetGalleryImageFavorite(ctx context.Context, userID string, id string, favorited bool) (models.WebGalleryImage, error) {
	if favorited {
		_, err := p.pool.Exec(ctx, `
			insert into web_gallery_image_favorites (image_id, user_id)
			values ($1::uuid, $2::uuid)
			on conflict (image_id, user_id) do nothing
		`, id, userID)
		if err != nil {
			return models.WebGalleryImage{}, err
		}
	} else {
		if _, err := p.pool.Exec(ctx, `delete from web_gallery_image_favorites where image_id = $1::uuid and user_id = $2::uuid`, id, userID); err != nil {
			return models.WebGalleryImage{}, err
		}
	}
	return p.getGalleryImage(ctx, userID, id)
}

func (p *Postgres) SetGalleryImageFeatured(ctx context.Context, userID string, id string, featured bool, promptFeatured bool) (models.WebGalleryImage, error) {
	tag, err := p.pool.Exec(ctx, `
		update web_gallery_images
		set is_featured = $3, is_prompt_featured = $4
		where id = $1::uuid and user_id = $2::uuid
	`, id, userID, featured, promptFeatured)
	if err != nil {
		return models.WebGalleryImage{}, err
	}
	if tag.RowsAffected() == 0 {
		return models.WebGalleryImage{}, ErrNotFound
	}
	return p.getGalleryImage(ctx, userID, id)
}

func (p *Postgres) CreateWebImageTask(ctx context.Context, userID string, prompt string, style string, modelID string, size string, quality string, n int, creditsCost int, isPublic bool) (models.WebImageTask, error) {
	row := p.pool.QueryRow(ctx, webImageTaskSelect(`
		insert into web_image_tasks (user_id, prompt, style, model_id, model_name, size, quality, n, credits_cost, is_public)
		values ($1::uuid, $2, $3, $4, coalesce((select name from image_models where id = $4), ''), $5, $6, $7, $8, $9)
		returning
	`), userID, prompt, style, strings.TrimSpace(modelID), size, quality, n, creditsCost, isPublic)
	task, err := scanWebImageTask(row)
	if err != nil && strings.Contains(err.Error(), "web_image_tasks_one_active_per_user_idx") {
		return models.WebImageTask{}, ErrConflict
	}
	return task, err
}

func (p *Postgres) HasActiveWebImageTask(ctx context.Context, userID string) (bool, error) {
	var active bool
	err := p.pool.QueryRow(ctx, `
		select exists (
			select 1
			from web_image_tasks
			where user_id = $1::uuid and status in ('queued', 'running')
		)
	`, userID).Scan(&active)
	return active, err
}

func (p *Postgres) ListWebImageTasks(ctx context.Context, userID string, limit int) ([]models.WebImageTask, error) {
	if limit < 1 {
		limit = 20
	}
	if limit > 60 {
		limit = 60
	}
	rows, err := p.pool.Query(ctx, `
		select t.id::text, t.user_id::text, t.prompt, t.style, coalesce(t.model_id, ''), coalesce(t.model_name, ''), t.size, t.quality, t.n, t.credits_cost,
			t.status, t.error_message,
			coalesce(nullif(t.result_image_data, ''), g.image_data, ''),
			coalesce(nullif(t.result_mime_type, ''), g.mime_type, ''),
			coalesce(t.gallery_image_id::text, ''), t.is_public, t.created_at, t.started_at, t.completed_at, t.updated_at
		from web_image_tasks t
		left join web_gallery_images g on g.id = t.gallery_image_id
		where t.user_id = $1::uuid
		order by t.created_at desc
		limit $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []models.WebImageTask
	for rows.Next() {
		item, err := scanWebImageTask(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (p *Postgres) GetWebImageTask(ctx context.Context, userID string, id string) (models.WebImageTask, error) {
	row := p.pool.QueryRow(ctx, webImageTaskSelect(`
		select
	`)+` from web_image_tasks where id = $1::uuid and user_id = $2::uuid`, id, userID)
	task, err := scanWebImageTask(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.WebImageTask{}, ErrNotFound
	}
	return task, err
}

func (p *Postgres) MarkWebImageTaskRunning(ctx context.Context, userID string, id string) error {
	tag, err := p.pool.Exec(ctx, `
		update web_image_tasks
		set status = 'running', started_at = coalesce(started_at, now()), updated_at = now()
		where id = $1::uuid and user_id = $2::uuid and status = 'queued'
	`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (p *Postgres) CompleteWebImageTask(ctx context.Context, userID string, id string, result models.WebGeneratedImage, galleryID string) (models.WebImageTask, error) {
	row := p.pool.QueryRow(ctx, webImageTaskSelect(`
		update web_image_tasks
		set status = 'succeeded',
			error_message = '',
			result_image_data = $3,
			result_mime_type = $4,
			gallery_image_id = nullif($5, '')::uuid,
			completed_at = now(),
			updated_at = now()
		where id = $1::uuid and user_id = $2::uuid
		returning
	`), id, userID, result.URL, firstNonEmptyStore(result.MimeType, "image/png"), strings.TrimSpace(galleryID))
	task, err := scanWebImageTask(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.WebImageTask{}, ErrNotFound
	}
	return task, err
}

func (p *Postgres) FailWebImageTask(ctx context.Context, userID string, id string, errorMessage string) (models.WebImageTask, error) {
	row := p.pool.QueryRow(ctx, webImageTaskSelect(`
		update web_image_tasks
		set status = 'failed', error_message = $3, completed_at = now(), updated_at = now()
		where id = $1::uuid and user_id = $2::uuid
		returning
	`), id, userID, strings.TrimSpace(errorMessage))
	task, err := scanWebImageTask(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.WebImageTask{}, ErrNotFound
	}
	return task, err
}

func (p *Postgres) SetWebImageTaskPublic(ctx context.Context, userID string, id string, isPublic bool) (models.WebImageTask, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return models.WebImageTask{}, err
	}
	defer tx.Rollback(ctx)
	row := tx.QueryRow(ctx, webImageTaskSelect(`
		update web_image_tasks
		set is_public = $3, updated_at = now()
		where id = $1::uuid and user_id = $2::uuid
		returning
	`), id, userID, isPublic)
	task, err := scanWebImageTask(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.WebImageTask{}, ErrNotFound
	}
	if err != nil {
		return models.WebImageTask{}, err
	}
	if strings.TrimSpace(task.GalleryImageID) != "" {
		if _, err := tx.Exec(ctx, `
			update web_gallery_images
			set is_public = $3
			where id = $1::uuid and user_id = $2::uuid
		`, task.GalleryImageID, userID, isPublic); err != nil {
			return models.WebImageTask{}, err
		}
	}
	return task, tx.Commit(ctx)
}

func (p *Postgres) scanUser(ctx context.Context, query string, args ...any) (models.User, error) {
	var user models.User
	err := p.pool.QueryRow(ctx, query, args...).Scan(
		&user.ID,
		&user.AppID,
		&user.Email,
		&user.DisplayName,
		&user.AvatarURL,
		&user.Signature,
		&user.Gender,
		&user.InviteCode,
		&user.Credits,
		&user.TotalRecharged,
		&user.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.User{}, ErrNotFound
	}
	return user, err
}

func (p *Postgres) getGalleryImage(ctx context.Context, userID string, id string) (models.WebGalleryImage, error) {
	row := p.pool.QueryRow(ctx, `
		select g.id::text, coalesce(g.user_id::text, ''),
			coalesce(u.display_name, ''), coalesce(u.avatar_url, ''),
			g.image_data, g.prompt, g.style,
			coalesce(g.model_id, ''), coalesce(g.model_name, ''), g.mime_type, g.size, g.quality, g.credits_cost,
			g.is_public, g.is_featured, g.is_prompt_featured,
			(select count(*)::int from web_gallery_image_likes where image_id = g.id),
			case when nullif($2, '') is null then false else exists (
				select 1 from web_gallery_image_likes where image_id = g.id and user_id = $2::uuid
			) end,
			(select count(*)::int from web_gallery_image_favorites where image_id = g.id),
			case when nullif($2, '') is null then false else exists (
				select 1 from web_gallery_image_favorites where image_id = g.id and user_id = $2::uuid
			) end,
			g.created_at
		from web_gallery_images g
		left join users u on u.id = g.user_id
		where g.id = $1::uuid
	`, id, strings.TrimSpace(userID))
	item, err := scanGalleryImage(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.WebGalleryImage{}, ErrNotFound
	}
	return item, err
}

func scanGalleryImage(row interface{ Scan(dest ...any) error }) (models.WebGalleryImage, error) {
	var item models.WebGalleryImage
	var mimeType string
	var createdAt time.Time
	err := row.Scan(
		&item.ID,
		&item.UserID,
		&item.Author,
		&item.AuthorAvatarURL,
		&item.Image,
		&item.Prompt,
		&item.Style,
		&item.ModelID,
		&item.ModelName,
		&mimeType,
		&item.Size,
		&item.Quality,
		&item.CreditsCost,
		&item.IsPublic,
		&item.IsFeatured,
		&item.IsPromptFeatured,
		&item.LikeCount,
		&item.LikedByMe,
		&item.FavoriteCount,
		&item.FavoritedByMe,
		&createdAt,
	)
	if err != nil {
		return models.WebGalleryImage{}, err
	}
	item.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	item.Ratio = webGalleryRatio(item.Size)
	item.Tag = firstNonEmptyStore(item.Style, "新作品")
	return item, nil
}

func webImageTaskSelect(prefix string) string {
	return prefix + `
		id::text, user_id::text, prompt, style, coalesce(model_id, ''), coalesce(model_name, ''), size, quality, n, credits_cost,
		status, error_message, result_image_data, result_mime_type,
		coalesce(gallery_image_id::text, ''), is_public, created_at, started_at, completed_at, updated_at
	`
}

func scanWebImageTask(row interface{ Scan(dest ...any) error }) (models.WebImageTask, error) {
	var task models.WebImageTask
	var createdAt, updatedAt time.Time
	var startedAt, completedAt sql.NullTime
	err := row.Scan(
		&task.ID,
		&task.UserID,
		&task.Prompt,
		&task.Style,
		&task.ModelID,
		&task.ModelName,
		&task.Size,
		&task.Quality,
		&task.N,
		&task.CreditsCost,
		&task.Status,
		&task.ErrorMessage,
		&task.ResultImage,
		&task.ResultMimeType,
		&task.GalleryImageID,
		&task.IsPublic,
		&createdAt,
		&startedAt,
		&completedAt,
		&updatedAt,
	)
	if err != nil {
		return models.WebImageTask{}, err
	}
	task.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	task.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
	if startedAt.Valid {
		task.StartedAt = startedAt.Time.UTC().Format(time.RFC3339)
	}
	if completedAt.Valid {
		task.CompletedAt = completedAt.Time.UTC().Format(time.RFC3339)
	}
	return task, nil
}

func webGalleryRatio(size string) string {
	parts := strings.Split(strings.TrimSpace(size), "x")
	if len(parts) != 2 {
		return "tall"
	}
	width, _ := strconv.Atoi(parts[0])
	height, _ := strconv.Atoi(parts[1])
	if width > height {
		return "wide"
	}
	if width == height {
		return "square"
	}
	return "tall"
}

func randomToken(size int) (string, error) {
	token := make([]byte, size)
	if _, err := rand.Read(token); err != nil {
		return "", err
	}
	return hex.EncodeToString(token), nil
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func firstNonEmptyStore(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

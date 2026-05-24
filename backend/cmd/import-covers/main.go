package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"pianke-ticket/backend/internal/config"
	"pianke-ticket/backend/internal/database"

	"github.com/aws/aws-sdk-go-v2/aws"
	awscredentials "github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5/pgxpool"
)

type coverImport struct {
	Filename string
	Prompt   string
}

var covers = []coverImport{
	{
		Filename: "nvdi.png",
		Prompt:   "小说封面，古风权谋甜宠题材，红金宫廷场景，左侧深红卷轴质感与金色书法大标题，右侧年轻女帝身穿华丽红色凤袍和金饰发冠，俯身凝视落榜书生，书生坐在案前手持落榜文书，窗外盛世皇城与人群，红纱帷幔、玉佩流苏、花瓣飘落、金粉光效，华丽细腻国风插画，竖版封面排版，强烈戏剧光影。",
	},
	{
		Filename: "shequ2.png",
		Prompt:   "小说封面，都市医疗爽文题材，晴朗白天的社区医院外景，年轻男医生穿白大褂佩戴听诊器在诊台前书写病例，身旁悬浮蓝色全息疾病词条面板，包含高血压、感冒、脂肪肝等诊疗信息，现代医院大楼与绿树阳光背景，科技感 UI、清爽蓝白配色、巨大冲击力中文标题，竖版网文封面。",
	},
	{
		Filename: "微信图片_20260517174722_115_10.png",
		Prompt:   "小说封面，古风多女主修罗场题材，夜色宫廷台阶与满月背景，黑衣长发男主受伤坐在中央，周围九位华美女帝低眉环绕，红绸飘带、花瓣飞散、宫灯与楼阁纵深，顶部超大毛笔字标题，红色血迹横幅副标题，暗黑华丽国风插画，强烈情绪张力，竖版封面。",
	},
	{
		Filename: "9998220623017229-a04cbf5a-a303-437b-85ee-bf7970a95fb3-gpt_image_2_official_task_01KS5J42QHWJRE105JNYJV11PG_0.png",
		Prompt:   "小说封面，仙侠大道题材，白衣修士站在云海悬崖边远望天宫神城，天空形成巨大旋涡与金色天道符文，中央圣城发出通天光柱，远处有盘旋巨龙与群山仙阁，整体银白与淡金色调，空灵宏大、东方水墨与电影级奇幻结合，左侧竖排大字标题，方形封面构图。",
	},
	{
		Filename: "wsq111.png",
		Prompt:   "小说封面，二次元都市经营爽文题材，男主站在高楼天台张开双臂俯瞰热闹 ACG 城市，远处有城堡、摩天轮、飞艇、动漫广告巨屏、Cosplay 大赛舞台和霓虹商业街，天空彩纸飞舞，色彩明亮饱和，顶部超大立体金白标题，每天两百万县城打造二次元圣地，热血轻小说封面风格。",
	},
	{
		Filename: "baoan.png",
		Prompt:   "小说封面，都市直播抓捕爽文题材，雨夜小区门口与警灯闪烁，英俊保安穿黑色制服戴保安帽站在右侧，背后警察押住逃犯，画面叠加直播 UI、观看人数、弹幕评论和礼物特效，黑蓝夜景配橙色火花，底部巨大金属质感中文标题，紧张热血、电影感光影，竖版封面。",
	},
	{
		Filename: "hetun.png",
		Prompt:   "小说封面，废土异兽变异题材，巨大的紫色河豚怪兽在污染末日城市上空膨胀，占据画面主体，背刺、发光眼睛、紫色雷电与核辐射标志环绕，远处废墟、爆炸蘑菇云和黑暗船影，紫黑高反差灾变氛围，底部巨大冰裂质感中文标题，从一头紫色河豚化身核弹天灾，竖版封面。",
	},
	{
		Filename: "image.png",
		Prompt:   "小说封面，玄幻武神逆袭题材，黑衣长发剑客背对观众站在群山古城废墟之间，手持蓝光魔剑，天空雷云旋涡中显现白发武神神像，四周山峰崩裂、闪电、碎石和火星飞散，冷灰黑与银白主色，超大白色毛笔字标题，史诗级东方奇幻插画，竖版封面。",
	},
}

func main() {
	ctx := context.Background()
	cfg := config.Load()
	databaseURL, closeTunnel, err := databaseURL(ctx, cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer closeTunnel()

	dbCtx, cancelDB := context.WithTimeout(ctx, 25*time.Second)
	pool, err := database.Open(dbCtx, databaseURL)
	cancelDB()
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	if database.ParseBool(os.Getenv("IMPORT_COVERS_ENSURE_SCHEMA")) {
		schemaCtx, cancelSchema := context.WithTimeout(ctx, 4*time.Minute)
		if err := database.EnsureSchema(schemaCtx, pool); err != nil {
			cancelSchema()
			log.Fatal(err)
		}
		cancelSchema()
	}

	userID, err := ensureCoverUser(ctx, pool, firstNonEmpty(cfg.WebAppID, "berserk.web"))
	if err != nil {
		log.Fatal(err)
	}

	coverDir := filepath.Clean("../GPT封面")
	if len(os.Args) > 1 {
		coverDir = os.Args[1]
	}

	var inserted, skipped int
	for _, cover := range covers {
		path := filepath.Join(coverDir, cover.Filename)
		result, err := persistCover(ctx, cfg, path)
		if err != nil {
			log.Fatalf("persist %s: %v", cover.Filename, err)
		}

		var exists bool
		err = pool.QueryRow(ctx, `select exists(select 1 from web_gallery_images where image_data = $1)`, result.URL).Scan(&exists)
		if err != nil {
			log.Fatal(err)
		}
		if exists {
			skipped++
			fmt.Printf("skipped %s\n", cover.Filename)
			continue
		}

		_, err = pool.Exec(ctx, `
			insert into web_gallery_images (
				user_id, prompt, style, model_id, model_name, image_data, mime_type,
				size, quality, credits_cost, is_public, is_featured, is_prompt_featured
			)
			values ($1::uuid, $2, '小说封面', 'gpt-image', 'GPT Image', $3, $4, $5, 'high', 3, true, true, true)
		`, userID, cover.Prompt, result.URL, result.MimeType, result.Size)
		if err != nil {
			log.Fatal(err)
		}
		inserted++
		fmt.Printf("inserted %s\n", cover.Filename)
	}

	fmt.Printf("done: inserted=%d skipped=%d user=%s\n", inserted, skipped, userID)
}

func databaseURL(ctx context.Context, cfg config.Config) (string, func(), error) {
	if !database.ParseBool(cfg.DatabaseSSHTunnel.Enabled) {
		return cfg.DatabaseURL, func() {}, nil
	}
	remoteAddr, err := database.DatabaseRemoteAddr(cfg.DatabaseURL, cfg.DatabaseSSHTunnel.RemoteAddr)
	if err != nil {
		return "", nil, err
	}
	tunnel, err := database.StartSSHTunnel(ctx, database.SSHTunnelConfig{
		Enabled:              true,
		Host:                 cfg.DatabaseSSHTunnel.Host,
		Port:                 cfg.DatabaseSSHTunnel.Port,
		User:                 cfg.DatabaseSSHTunnel.User,
		Password:             cfg.DatabaseSSHTunnel.Password,
		PrivateKeyPath:       cfg.DatabaseSSHTunnel.PrivateKeyPath,
		PrivateKeyPassphrase: cfg.DatabaseSSHTunnel.PrivateKeyPassphrase,
		LocalAddr:            cfg.DatabaseSSHTunnel.LocalAddr,
		RemoteAddr:           remoteAddr,
	})
	if err != nil {
		return "", nil, err
	}
	url, err := database.DatabaseURLForTunnel(cfg.DatabaseURL, tunnel.LocalAddr())
	if err != nil {
		tunnel.Close()
		return "", nil, err
	}
	return url, func() { _ = tunnel.Close() }, nil
}

type storedCover struct {
	URL      string
	MimeType string
	Size     string
}

func persistCover(ctx context.Context, cfg config.Config, path string) (storedCover, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return storedCover{}, err
	}
	mime := http.DetectContentType(data)
	if !strings.HasPrefix(mime, "image/") {
		return storedCover{}, fmt.Errorf("not an image: %s", path)
	}
	cfgImage, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return storedCover{}, err
	}
	sum := sha256.Sum256(data)
	hash := hex.EncodeToString(sum[:])
	ext := strings.ToLower(filepath.Ext(path))
	if ext == "" {
		ext = ".png"
	}
	filename := "covers/" + hash + ext
	size := fmt.Sprintf("%dx%d", cfgImage.Width, cfgImage.Height)

	if r2Configured(cfg) {
		objectKey := objectKey(cfg.R2ObjectPrefix, filename)
		uri := storageURI("r2", cfg.R2Bucket, objectKey)
		if err := uploadR2(ctx, cfg, objectKey, data, mime); err != nil {
			return storedCover{}, err
		}
		return storedCover{URL: uri, MimeType: mime, Size: size}, nil
	}

	targetDir := filepath.Join(cfg.GeneratedImageDir, "covers")
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return storedCover{}, err
	}
	target := filepath.Join(targetDir, hash+ext)
	if err := os.WriteFile(target, data, 0o644); err != nil {
		return storedCover{}, err
	}
	base := strings.TrimRight(strings.TrimSpace(cfg.PublicBaseURL), "/")
	if base == "" {
		base = ""
	}
	return storedCover{URL: base + "/generated/covers/" + hash + ext, MimeType: mime, Size: size}, nil
}

func ensureCoverUser(ctx context.Context, pool *pgxpool.Pool, appID string) (string, error) {
	var userID string
	err := pool.QueryRow(ctx, `
		insert into users (app_id, email, email_normalized, password_hash, display_name, avatar_url)
		values ($1, 'covers@berserk-ai.local', 'covers@berserk-ai.local', '', 'Berserk 封面工坊', '/assets/berserk-ai-icon.png')
		on conflict (app_id, email_normalized) do update set
			display_name = excluded.display_name,
			avatar_url = excluded.avatar_url,
			updated_at = now()
		returning id::text
	`, appID).Scan(&userID)
	return userID, err
}

func r2Configured(cfg config.Config) bool {
	return strings.TrimSpace(cfg.R2Bucket) != "" &&
		strings.TrimSpace(cfg.R2Endpoint) != "" &&
		strings.TrimSpace(cfg.R2AccessKeyID) != "" &&
		strings.TrimSpace(cfg.R2AccessKeySecret) != ""
}

func uploadR2(ctx context.Context, cfg config.Config, objectKey string, data []byte, mime string) error {
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	client := s3.New(s3.Options{
		Region:       "auto",
		BaseEndpoint: aws.String(cfg.R2Endpoint),
		Credentials: aws.NewCredentialsCache(
			awscredentials.NewStaticCredentialsProvider(cfg.R2AccessKeyID, cfg.R2AccessKeySecret, ""),
		),
	})
	contentLength := int64(len(data))
	_, err := client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(cfg.R2Bucket),
		Key:           aws.String(objectKey),
		Body:          bytes.NewReader(data),
		ContentLength: &contentLength,
		ContentType:   aws.String(mime),
		CacheControl:  aws.String("private, max-age=3600"),
	})
	return err
}

func objectKey(prefix string, filename string) string {
	prefix = strings.Trim(strings.TrimSpace(prefix), "/")
	if prefix == "" {
		return strings.TrimLeft(filename, "/")
	}
	return prefix + "/" + strings.TrimLeft(filename, "/")
}

func storageURI(scheme string, bucket string, objectKey string) string {
	return scheme + "://" + strings.TrimSpace(bucket) + "/" + strings.TrimLeft(strings.TrimSpace(objectKey), "/")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

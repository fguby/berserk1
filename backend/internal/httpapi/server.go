package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"pianke-ticket/backend/internal/models"
	"pianke-ticket/backend/internal/store"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/time/rate"
)

type ServerConfig struct {
	Addr                   string
	PublicBaseURL          string
	WebAppID               string
	EmailCodeTTLSeconds    string
	SMTPHost               string
	SMTPPort               string
	SMTPUsername           string
	SMTPPassword           string
	SMTPFromEmail          string
	SMTPFromName           string
	SMTPTLSMode            string
	XAIAPIKey              string
	XAIBaseURL             string
	XAIResponsesPath       string
	XAIMainModel           string
	XAIImageModel          string
	GeneratedImageDir      string
	OSSBucket              string
	OSSRegion              string
	OSSEndpoint            string
	OSSAccessKeyID         string
	OSSAccessKeySecret     string
	OSSSecurityToken       string
	OSSObjectPrefix        string
	OSSSignedURLTTLSeconds string
	R2Bucket               string
	R2Endpoint             string
	R2AccessKeyID          string
	R2AccessKeySecret      string
	R2ObjectPrefix         string
	R2SignedURLTTLSeconds  string
	Store                  store.BerserkStore
	Logger                 *slog.Logger
}

type Server struct {
	echo               *echo.Echo
	addr               string
	publicBaseURL      string
	webAppID           string
	emailCodeTTL       time.Duration
	smtpHost           string
	smtpPort           string
	smtpUsername       string
	smtpPassword       string
	smtpFromEmail      string
	smtpFromName       string
	smtpTLSMode        string
	xaiAPIKey          string
	xaiBaseURL         string
	xaiResponsesPath   string
	xaiMainModel       string
	xaiImageModel      string
	generatedImageDir  string
	ossBucket          string
	ossRegion          string
	ossEndpoint        string
	ossAccessKeyID     string
	ossAccessKeySecret string
	ossSecurityToken   string
	ossObjectPrefix    string
	ossSignedURLTTL    time.Duration
	r2Bucket           string
	r2Endpoint         string
	r2AccessKeyID      string
	r2AccessKeySecret  string
	r2ObjectPrefix     string
	r2SignedURLTTL     time.Duration
	store              store.BerserkStore
	logger             *slog.Logger
}

func NewServer(cfg ServerConfig) *Server {
	e := echo.New()
	e.HideBanner = true
	e.HidePort = true
	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{
			"http://127.0.0.1:5173",
			"http://127.0.0.1:5174",
			"http://127.0.0.1:5175",
			"http://127.0.0.1:5176",
			"http://127.0.0.1:5177",
			"http://localhost:5173",
			"http://localhost:5174",
			"http://localhost:5175",
			"http://localhost:5176",
			"http://localhost:5177",
			"https://www.eatfit.fun",
			"https://eatfit.fun",
		},
		AllowMethods: []string{http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowHeaders: []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept, echo.HeaderAuthorization},
		MaxAge:       86400,
	}))
	e.Use(middleware.RequestLoggerWithConfig(middleware.RequestLoggerConfig{
		LogURI:    true,
		LogStatus: true,
		LogError:  true,
		LogValuesFunc: func(c echo.Context, values middleware.RequestLoggerValues) error {
			if cfg.Logger != nil {
				cfg.Logger.Info("request", "uri", values.URI, "status", values.Status, "error", values.Error)
			}
			return nil
		},
	}))

	server := &Server{
		echo:               e,
		addr:               firstNonEmpty(cfg.Addr, ":8080"),
		publicBaseURL:      strings.TrimRight(cfg.PublicBaseURL, "/"),
		webAppID:           firstNonEmpty(cfg.WebAppID, "berserk.web"),
		emailCodeTTL:       emailCodeTTL(cfg.EmailCodeTTLSeconds),
		smtpHost:           cfg.SMTPHost,
		smtpPort:           firstNonEmpty(cfg.SMTPPort, "587"),
		smtpUsername:       cfg.SMTPUsername,
		smtpPassword:       cfg.SMTPPassword,
		smtpFromEmail:      cfg.SMTPFromEmail,
		smtpFromName:       firstNonEmpty(cfg.SMTPFromName, "NeoAI"),
		smtpTLSMode:        firstNonEmpty(cfg.SMTPTLSMode, "starttls"),
		xaiAPIKey:          strings.TrimSpace(cfg.XAIAPIKey),
		xaiBaseURL:         strings.TrimRight(firstNonEmpty(cfg.XAIBaseURL, "https://api-xai.ainaibahub.com/v1"), "/"),
		xaiResponsesPath:   firstNonEmpty(cfg.XAIResponsesPath, "/responses"),
		xaiMainModel:       firstNonEmpty(cfg.XAIMainModel, "gpt-5.5"),
		xaiImageModel:      firstNonEmpty(cfg.XAIImageModel, "gpt-image-2"),
		generatedImageDir:  firstNonEmpty(cfg.GeneratedImageDir, "generated-images"),
		ossBucket:          strings.TrimSpace(cfg.OSSBucket),
		ossRegion:          strings.TrimSpace(cfg.OSSRegion),
		ossEndpoint:        strings.TrimRight(strings.TrimSpace(cfg.OSSEndpoint), "/"),
		ossAccessKeyID:     strings.TrimSpace(cfg.OSSAccessKeyID),
		ossAccessKeySecret: strings.TrimSpace(cfg.OSSAccessKeySecret),
		ossSecurityToken:   strings.TrimSpace(cfg.OSSSecurityToken),
		ossObjectPrefix:    strings.Trim(strings.TrimSpace(cfg.OSSObjectPrefix), "/"),
		ossSignedURLTTL:    signedURLTTL(cfg.OSSSignedURLTTLSeconds),
		r2Bucket:           strings.TrimSpace(cfg.R2Bucket),
		r2Endpoint:         normalizeR2Endpoint(cfg.R2Endpoint),
		r2AccessKeyID:      strings.TrimSpace(cfg.R2AccessKeyID),
		r2AccessKeySecret:  strings.TrimSpace(cfg.R2AccessKeySecret),
		r2ObjectPrefix:     strings.Trim(strings.TrimSpace(cfg.R2ObjectPrefix), "/"),
		r2SignedURLTTL:     signedURLTTL(cfg.R2SignedURLTTLSeconds),
		store:              cfg.Store,
		logger:             cfg.Logger,
	}
	server.routes()
	return server
}

func (s *Server) Start() error {
	err := s.echo.Start(s.addr)
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.echo.Shutdown(ctx)
}

func (s *Server) routes() {
	health := func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok", "service": "berserk"})
	}
	s.echo.GET("/berserk/healthz", health)
	s.echo.Static("/berserk/generated", s.generatedImageDir)

	api := s.echo.Group("/berserk/api/v1")
	s.registerAPIRoutes(api)
}

func (s *Server) registerAPIRoutes(api *echo.Group) {
	webImageLimiter := middleware.RateLimiter(middleware.NewRateLimiterMemoryStoreWithConfig(
		middleware.RateLimiterMemoryStoreConfig{
			Rate:      rate.Limit(0.2),
			Burst:     3,
			ExpiresIn: 10 * time.Minute,
		},
	))

	api.POST("/auth/email/code", s.sendEmailCode)
	api.POST("/auth/email/verify", s.verifyEmailCode)
	api.POST("/auth/email/register", s.authEmailRegister)
	api.POST("/auth/email/login", s.authEmailLogin)
	api.POST("/auth/email/reset", s.resetEmailPassword)
	api.GET("/me", s.getMe)
	api.PATCH("/me/profile", s.updateMeProfile)
	api.PATCH("/me/password", s.updateMePassword)
	api.DELETE("/me", s.deleteMe)
	api.GET("/credits/packages", s.listCreditPackages)
	api.POST("/credits/purchase", s.purchaseCredits)
	api.POST("/credits/redeem", s.redeemCreditCode)
	api.GET("/referrals/me", s.getReferralSummary)
	api.GET("/images/gallery", s.listWebGallery)
	api.GET("/images/proxy", s.proxyStoredImage)
	api.POST("/images/gallery/:id/like", s.likeWebGalleryImage)
	api.POST("/images/gallery/:id/favorite", s.favoriteWebGalleryImage)
	api.PATCH("/images/gallery/:id/featured", s.featureWebGalleryImage)
	api.GET("/images/models", s.listImageModels)
	api.POST("/images/tasks", s.createWebImageTask, webImageLimiter)
	api.GET("/images/tasks", s.listWebImageTasks)
	api.GET("/images/tasks/:id", s.getWebImageTask)
	api.PATCH("/images/tasks/:id/public", s.setWebImageTaskPublic)
	api.POST("/images/generate", s.generateWebImage, webImageLimiter)
	api.POST("/web/images/generate", s.generateWebImage, webImageLimiter)
	api.GET("/manga/works", s.listComicWorks)
	api.POST("/manga/works", s.createComicWork)
	api.POST("/manga/works/:workID/episodes", s.createComicEpisode)
	api.POST("/manga/episodes/:episodeID/pages", s.createComicPage)
	api.PATCH("/manga/pages/:pageID", s.updateComicPage)
	api.POST("/manga/pages/:pageID/duplicate", s.duplicateComicPage)
	api.POST("/manga/script", s.parseComicScript)
	api.POST("/manga/generate", s.generateComicImage, webImageLimiter)
	api.GET("/studio/assets", s.listComicAssets)
	api.PATCH("/studio/assets/:id", s.updateComicAsset)
	api.POST("/studio/assets/:id/favorite", s.favoriteComicAsset)
	api.POST("/studio/assets/:id/generate", s.generateComicImage, webImageLimiter)
}

func (s *Server) getMe(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	return c.JSON(http.StatusOK, user)
}

func (s *Server) updateMeProfile(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	var request models.UserProfileUpdateRequest
	if err := c.Bind(&request); err != nil {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "invalid profile payload"})
	}
	updated, err := s.store.UpdateUserProfile(c.Request().Context(), user.ID, request)
	if errors.Is(err, store.ErrNotFound) {
		return c.JSON(http.StatusNotFound, models.ErrorResponse{Message: "user not found"})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "update profile failed"})
	}
	return c.JSON(http.StatusOK, updated)
}

func (s *Server) updateMePassword(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	var request models.PasswordChangeRequest
	if err := c.Bind(&request); err != nil {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "invalid password payload"})
	}
	currentPassword := strings.TrimSpace(request.CurrentPassword)
	if currentPassword == "" {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "请输入当前密码"})
	}
	newPasswordHash, ok := passwordHashForRequest(request.NewPassword)
	if !ok {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "密码至少需要 8 位"})
	}
	passwordHash, err := s.store.GetEmailPasswordHash(c.Request().Context(), user.AppID, user.Email)
	if errors.Is(err, store.ErrNotFound) {
		return c.JSON(http.StatusNotFound, models.ErrorResponse{Message: "该账号尚未设置邮箱密码"})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "密码状态检查失败"})
	}
	if bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(currentPassword)) != nil {
		return c.JSON(http.StatusUnauthorized, models.ErrorResponse{Message: "当前密码不正确"})
	}
	if err := s.store.SetEmailUserPassword(c.Request().Context(), user.AppID, user.Email, newPasswordHash); errors.Is(err, store.ErrNotFound) {
		return c.JSON(http.StatusNotFound, models.ErrorResponse{Message: "该账号尚未设置邮箱密码"})
	} else if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "修改密码失败，请稍后重试"})
	}
	return c.JSON(http.StatusOK, user)
}

func (s *Server) deleteMe(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	if err := s.store.DeleteUser(c.Request().Context(), user.ID); errors.Is(err, store.ErrNotFound) {
		return c.JSON(http.StatusNotFound, models.ErrorResponse{Message: "user not found"})
	} else if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "delete account failed"})
	}
	return c.NoContent(http.StatusNoContent)
}

func (s *Server) currentUser(c echo.Context) (models.User, error) {
	auth := strings.TrimSpace(c.Request().Header.Get(echo.HeaderAuthorization))
	if auth == "" {
		return models.User{}, store.ErrNotFound
	}
	token := auth
	if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		token = strings.TrimSpace(auth[7:])
	}
	if token == "" {
		return models.User{}, store.ErrNotFound
	}
	return s.store.GetUserBySession(c.Request().Context(), token)
}

func (s *Server) requireUser(c echo.Context) (models.User, bool) {
	user, err := s.currentUser(c)
	if errors.Is(err, store.ErrNotFound) {
		_ = c.JSON(http.StatusUnauthorized, models.ErrorResponse{Message: "unauthorized"})
		return models.User{}, false
	}
	if err != nil {
		_ = c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "load user failed"})
		return models.User{}, false
	}
	user = s.withImagePricingCompensation(c.Request().Context(), user)
	return user, true
}

func (s *Server) withImagePricingCompensation(ctx context.Context, user models.User) models.User {
	if strings.TrimSpace(user.ID) == "" {
		return user
	}
	notice, err := s.store.ApplyImagePricingCompensation(ctx, user.ID)
	if err != nil {
		if s.logger != nil {
			s.logger.Warn("apply image pricing compensation failed", "userID", user.ID, "error", err)
		}
		return user
	}
	if notice.Amount <= 0 {
		return user
	}
	refreshed, err := s.store.GetUser(ctx, user.ID)
	if err == nil {
		user = refreshed
	} else if s.logger != nil {
		s.logger.Warn("reload compensated user failed", "userID", user.ID, "error", err)
	}
	user.CreditAdjustment = &notice
	return user
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func queryInt(c echo.Context, name string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(c.QueryParam(name)))
	if err != nil {
		return fallback
	}
	return value
}

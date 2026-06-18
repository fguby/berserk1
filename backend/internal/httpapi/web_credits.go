package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"pianke-ticket/backend/internal/models"
	paymentalipay "pianke-ticket/backend/internal/payment/alipay"
	"pianke-ticket/backend/internal/store"

	"github.com/labstack/echo/v4"
)

const webGenerationCreditCost = 3

var creditPackages = []models.CreditPackage{
	{ID: "credits_trial", Name: "限时体验包", Credits: 10, AmountCents: 100, Currency: "CNY", Icon: "/pricing-icons/package-trial.png"},
	{ID: "credits_100", Name: "灵感入门包", Credits: 110, AmountCents: 1000, Currency: "CNY", Icon: "/pricing-icons/package-100.png"},
	{ID: "credits_500", Name: "创作加速包", Credits: 550, AmountCents: 4900, Currency: "CNY", Icon: "/pricing-icons/package-500.png"},
	{ID: "credits_1000", Name: "高频创作包", Credits: 1100, AmountCents: 9500, Currency: "CNY", Icon: "/pricing-icons/package-1000.png"},
}

func (s *Server) listCreditPackages(c echo.Context) error {
	items, err := s.store.ListCreditPackages(c.Request().Context())
	if err != nil || len(items) == 0 {
		items = creditPackages
	}
	return c.JSON(http.StatusOK, models.CreditPackagesResponse{Items: items})
}

func (s *Server) getReferralSummary(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	summary, err := s.store.GetReferralSummary(c.Request().Context(), user.ID)
	if errors.Is(err, store.ErrNotFound) {
		return c.JSON(http.StatusUnauthorized, models.ErrorResponse{Message: "unauthorized"})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "load referral summary failed"})
	}
	return c.JSON(http.StatusOK, models.ReferralSummaryResponse{Summary: summary})
}

func (s *Server) purchaseCredits(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	var request models.CreditPurchaseRequest
	if err := c.Bind(&request); err != nil {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "invalid purchase payload"})
	}
	packages, err := s.store.ListCreditPackages(c.Request().Context())
	if err != nil || len(packages) == 0 {
		packages = creditPackages
	}
	pkg, ok := creditPackageByIDFrom(packages, request.PackageID)
	if !ok {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "invalid credit package"})
	}
	if strings.TrimSpace(pkg.PaymentURL) != "" {
		order := models.CreditOrder{
			PackageID:   pkg.ID,
			UserID:      user.ID,
			Credits:     pkg.Credits,
			AmountCents: pkg.AmountCents,
			Currency:    pkg.Currency,
			Status:      "pending_external",
			Provider:    "card_key",
		}
		return c.JSON(http.StatusOK, models.CreditPurchaseResponse{Order: order, User: user, PaymentURL: pkg.PaymentURL})
	}
	if s.alipayClient == nil || !s.alipayClient.Ready() {
		return c.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Message: "支付宝支付暂未配置，请稍后再试"})
	}
	channel := firstNonEmpty(strings.TrimSpace(request.Channel), "alipay_pc")
	method := paymentalipay.MethodPagePay
	switch channel {
	case "alipay_pc", "pc", "":
		method = paymentalipay.MethodPagePay
	case "alipay_wap", "wap", "h5":
		method = paymentalipay.MethodWAPPay
	default:
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "unsupported payment channel"})
	}
	outTradeNo, err := newOutTradeNo()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "create order number failed"})
	}
	order, err := s.store.CreatePendingCreditOrder(c.Request().Context(), user.ID, pkg, "alipay", outTradeNo, time.Now().Add(30*time.Minute))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "purchase credits failed"})
	}
	paymentHTML, err := s.alipayClient.PaymentForm(paymentalipay.PayRequest{
		OutTradeNo:  order.OutTradeNo,
		Subject:     fmt.Sprintf("%s - %s", pkg.Name, "Berserk AI 积分"),
		TotalAmount: centsToYuan(pkg.AmountCents),
		ProductCode: "",
		Body:        fmt.Sprintf("购买 %d 积分", pkg.Credits),
		Method:      method,
	})
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "create alipay payment failed"})
	}
	return c.JSON(http.StatusOK, models.CreditPurchaseResponse{Order: order, User: user, PaymentHTML: paymentHTML})
}

func creditPackageByID(id string) (models.CreditPackage, bool) {
	return creditPackageByIDFrom(creditPackages, id)
}

func creditPackageByIDFrom(packages []models.CreditPackage, id string) (models.CreditPackage, bool) {
	id = strings.TrimSpace(id)
	for _, pkg := range packages {
		if pkg.ID == id {
			return pkg, true
		}
	}
	return models.CreditPackage{}, false
}

func (s *Server) getCreditOrder(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	order, err := s.store.GetCreditOrder(c.Request().Context(), user.ID, c.Param("id"))
	if errors.Is(err, store.ErrNotFound) {
		return c.JSON(http.StatusNotFound, models.ErrorResponse{Message: "order not found"})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "load order failed"})
	}
	user, err = s.store.GetUser(c.Request().Context(), user.ID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "load user failed"})
	}
	return c.JSON(http.StatusOK, models.CreditOrderResponse{Order: order, User: user})
}

func newOutTradeNo() (string, error) {
	random := make([]byte, 5)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	return "BA" + time.Now().UTC().Format("20060102150405") + strings.ToUpper(hex.EncodeToString(random)), nil
}

func centsToYuan(cents int) string {
	return fmt.Sprintf("%d.%02d", cents/100, cents%100)
}

func yuanToCents(value string) (int, error) {
	parts := strings.Split(strings.TrimSpace(value), ".")
	if len(parts) == 0 || len(parts) > 2 {
		return 0, fmt.Errorf("invalid amount")
	}
	yuan, err := strconv.Atoi(firstNonEmpty(parts[0], "0"))
	if err != nil {
		return 0, err
	}
	fen := 0
	if len(parts) == 2 {
		decimal := parts[1]
		if len(decimal) == 1 {
			decimal += "0"
		}
		if len(decimal) > 2 {
			decimal = decimal[:2]
		}
		fen, err = strconv.Atoi(firstNonEmpty(decimal, "0"))
		if err != nil {
			return 0, err
		}
	}
	return yuan*100 + fen, nil
}

func (s *Server) redeemCreditCode(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	var request models.CreditRedeemRequest
	if err := c.Bind(&request); err != nil {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "invalid redeem payload"})
	}
	cardNo := firstNonEmpty(strings.TrimSpace(request.CardNo), strings.TrimSpace(request.Code))
	credits, err := s.store.RedeemCreditCode(c.Request().Context(), user.ID, cardNo, request.Password)
	if errors.Is(err, store.ErrNotFound) {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "卡号或密码错误，或卡密已被兑换"})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "兑换失败"})
	}
	user, err = s.store.GetUser(c.Request().Context(), user.ID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "load user failed"})
	}
	return c.JSON(http.StatusOK, models.CreditRedeemResponse{Credits: credits, User: user})
}

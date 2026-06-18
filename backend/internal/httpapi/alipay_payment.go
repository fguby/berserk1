package httpapi

import (
	"net/http"
	"net/url"
	"strings"

	"pianke-ticket/backend/internal/models"
	"pianke-ticket/backend/internal/store"

	"github.com/labstack/echo/v4"
)

func (s *Server) handleAlipayNotify(c echo.Context) error {
	if s.alipayClient == nil || !s.alipayClient.Ready() {
		return c.String(http.StatusOK, "failure")
	}
	if err := c.Request().ParseForm(); err != nil {
		return c.String(http.StatusOK, "failure")
	}
	params := formToMap(c.Request().PostForm)
	notification := models.AlipayNotification{
		OutTradeNo:  params["out_trade_no"],
		TradeNo:     params["trade_no"],
		TradeStatus: params["trade_status"],
		TotalAmount: params["total_amount"],
		RawBody:     c.Request().PostForm.Encode(),
	}
	fail := func(message string) error {
		notification.ErrorMessage = message
		_ = s.store.RecordAlipayNotification(c.Request().Context(), notification)
		if s.logger != nil {
			s.logger.Warn("alipay notify failed", "outTradeNo", notification.OutTradeNo, "error", message)
		}
		return c.String(http.StatusOK, "failure")
	}

	if err := s.alipayClient.Verify(params); err != nil {
		return fail("verify signature failed")
	}
	notification.Verified = true
	if strings.TrimSpace(params["app_id"]) != s.alipayClient.AppID() {
		return fail("app id mismatch")
	}
	if sellerID := strings.TrimSpace(s.alipayClient.SellerID()); sellerID != "" && strings.TrimSpace(params["seller_id"]) != sellerID {
		return fail("seller id mismatch")
	}
	order, err := s.store.GetCreditOrderByOutTradeNo(c.Request().Context(), notification.OutTradeNo)
	if err != nil {
		return fail("order not found")
	}
	if order.Provider != "alipay" {
		return fail("order provider mismatch")
	}
	paidAmountCents, err := yuanToCents(notification.TotalAmount)
	if err != nil {
		return fail("invalid total amount")
	}
	if paidAmountCents != order.AmountCents {
		return fail("total amount mismatch")
	}
	switch strings.TrimSpace(notification.TradeStatus) {
	case "TRADE_SUCCESS", "TRADE_FINISHED":
		paidOrder, err := s.store.MarkCreditOrderPaid(c.Request().Context(), notification.OutTradeNo, notification.TradeNo, paidAmountCents)
		if err != nil {
			if err == store.ErrConflict {
				return fail("order status conflict")
			}
			return fail("mark order paid failed")
		}
		notification.Processed = true
		_ = s.store.RecordAlipayNotification(c.Request().Context(), notification)
		if s.logger != nil {
			s.logger.Info("alipay notify processed", "orderID", paidOrder.ID, "outTradeNo", paidOrder.OutTradeNo)
		}
		return c.String(http.StatusOK, "success")
	default:
		_ = s.store.RecordAlipayNotification(c.Request().Context(), notification)
		return c.String(http.StatusOK, "success")
	}
}

func formToMap(values url.Values) map[string]string {
	params := make(map[string]string, len(values))
	for key, item := range values {
		if len(item) > 0 {
			params[key] = item[0]
		}
	}
	return params
}

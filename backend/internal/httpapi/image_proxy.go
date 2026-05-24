package httpapi

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/labstack/echo/v4"
)

const imageProxyTimeout = 30 * time.Second

func storageProxyURL(provider string, bucket string, objectKey string) string {
	values := url.Values{}
	values.Set("provider", strings.ToLower(strings.TrimSpace(provider)))
	values.Set("bucket", strings.TrimSpace(bucket))
	values.Set("key", strings.TrimLeft(strings.TrimSpace(objectKey), "/"))
	return "/berserk/api/v1/images/proxy?" + values.Encode()
}

func (s *Server) proxyStoredImage(c echo.Context) error {
	provider := strings.ToLower(strings.TrimSpace(c.QueryParam("provider")))
	bucket := strings.TrimSpace(c.QueryParam("bucket"))
	objectKey := strings.TrimLeft(strings.TrimSpace(c.QueryParam("key")), "/")
	if provider == "" || bucket == "" || objectKey == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"message": "invalid image proxy request"})
	}

	switch provider {
	case "r2":
		return s.proxyR2Object(c, bucket, objectKey)
	case "oss":
		return s.proxyOSSObject(c, bucket, objectKey)
	default:
		return c.JSON(http.StatusBadRequest, map[string]string{"message": "unsupported image provider"})
	}
}

func (s *Server) proxyR2Object(c echo.Context, bucket string, objectKey string) error {
	if !s.r2Configured() || !storageObjectAllowed(bucket, s.r2Bucket, objectKey, s.r2ObjectPrefix) {
		return c.JSON(http.StatusForbidden, map[string]string{"message": "image is not available"})
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), imageProxyTimeout)
	defer cancel()
	result, err := s.r2Client().GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return c.JSON(http.StatusBadGateway, map[string]string{"message": "load image failed"})
	}
	defer result.Body.Close()
	headers := c.Response().Header()
	contentType := strings.TrimSpace(aws.ToString(result.ContentType))
	if contentType == "" {
		contentType = "image/png"
	}
	headers.Set(echo.HeaderContentType, contentType)
	headers.Set(echo.HeaderCacheControl, "public, max-age=3600")
	headers.Set(echo.HeaderAccessControlAllowOrigin, "*")
	headers.Set("X-Content-Type-Options", "nosniff")
	if result.ContentLength != nil && *result.ContentLength >= 0 {
		headers.Set(echo.HeaderContentLength, strconv.FormatInt(*result.ContentLength, 10))
	}
	c.Response().WriteHeader(http.StatusOK)
	_, copyErr := io.Copy(c.Response().Writer, result.Body)
	return copyErr
}

func (s *Server) proxyOSSObject(c echo.Context, bucket string, objectKey string) error {
	if !s.ossConfigured() || !storageObjectAllowed(bucket, s.ossBucket, objectKey, s.ossObjectPrefix) {
		return c.JSON(http.StatusForbidden, map[string]string{"message": "image is not available"})
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), imageProxyTimeout)
	defer cancel()
	result, err := s.ossClient().GetObject(ctx, &oss.GetObjectRequest{
		Bucket: oss.Ptr(bucket),
		Key:    oss.Ptr(objectKey),
	})
	if err != nil {
		return c.JSON(http.StatusBadGateway, map[string]string{"message": "load image failed"})
	}
	defer result.Body.Close()
	headers := c.Response().Header()
	contentType := strings.TrimSpace(oss.ToString(result.ContentType))
	if contentType == "" {
		contentType = "image/png"
	}
	headers.Set(echo.HeaderContentType, contentType)
	headers.Set(echo.HeaderCacheControl, "public, max-age=3600")
	headers.Set(echo.HeaderAccessControlAllowOrigin, "*")
	headers.Set("X-Content-Type-Options", "nosniff")
	if result.ContentLength >= 0 {
		headers.Set(echo.HeaderContentLength, strconv.FormatInt(result.ContentLength, 10))
	}
	c.Response().WriteHeader(http.StatusOK)
	_, copyErr := io.Copy(c.Response().Writer, result.Body)
	return copyErr
}

func storageObjectAllowed(bucket string, configuredBucket string, objectKey string, configuredPrefix string) bool {
	if strings.TrimSpace(bucket) == "" || strings.TrimSpace(configuredBucket) == "" {
		return false
	}
	if bucket != configuredBucket {
		return false
	}
	objectKey = strings.TrimLeft(strings.TrimSpace(objectKey), "/")
	if objectKey == "" || strings.Contains(objectKey, "..") {
		return false
	}
	prefix := strings.Trim(strings.TrimSpace(configuredPrefix), "/")
	return prefix == "" || objectKey == prefix || strings.HasPrefix(objectKey, prefix+"/")
}

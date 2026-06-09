package httpapi

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"pianke-ticket/backend/internal/models"
	"pianke-ticket/backend/internal/store"

	"github.com/labstack/echo/v4"
)

const comicCreditCost = 3

func (s *Server) listComicWorks(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	items, err := s.store.ListComicWorks(c.Request().Context(), user.ID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "加载漫画作品失败"})
	}
	assets, _ := s.store.ListComicAssets(c.Request().Context(), user.ID, "", "", false)
	items, _ = s.signComicWorks(c.Request().Context(), items)
	assets, _ = s.signComicAssets(c.Request().Context(), assets)
	return c.JSON(http.StatusOK, models.ComicWorksResponse{Items: items, Assets: assets})
}

func (s *Server) createComicWork(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	var request models.ComicCreateWorkRequest
	if err := c.Bind(&request); err != nil {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "作品参数不正确"})
	}
	work, err := s.store.CreateComicWork(c.Request().Context(), user.ID, request.Title, request.Subtitle, request.Cover)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "创建作品失败"})
	}
	work, _ = s.signComicWork(c.Request().Context(), work)
	return c.JSON(http.StatusCreated, models.ComicWorkResponse{Work: work})
}

func (s *Server) createComicEpisode(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	var request models.ComicCreateEpisodeRequest
	if err := c.Bind(&request); err != nil {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "章节参数不正确"})
	}
	episode, err := s.store.CreateComicEpisode(c.Request().Context(), user.ID, c.Param("workID"), request.Title, request.Summary)
	if errors.Is(err, store.ErrNotFound) {
		return c.JSON(http.StatusNotFound, models.ErrorResponse{Message: "作品不存在"})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "新增章节失败"})
	}
	return c.JSON(http.StatusCreated, models.ComicEpisodeResponse{Episode: episode})
}

func (s *Server) createComicPage(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	var request models.ComicCreatePageRequest
	if err := c.Bind(&request); err != nil {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "页面参数不正确"})
	}
	page, err := s.store.CreateComicPage(c.Request().Context(), user.ID, c.Param("episodeID"), request.Title, request.Thumb)
	if errors.Is(err, store.ErrNotFound) {
		return c.JSON(http.StatusNotFound, models.ErrorResponse{Message: "章节不存在"})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "新增页面失败"})
	}
	page, _ = s.signComicPage(c.Request().Context(), page)
	return c.JSON(http.StatusCreated, models.ComicPageResponse{Page: page})
}

func (s *Server) updateComicPage(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	var request models.ComicUpdatePageRequest
	if err := c.Bind(&request); err != nil {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "页面保存参数不正确"})
	}
	page, err := s.store.UpdateComicPage(c.Request().Context(), user.ID, c.Param("pageID"), request)
	if errors.Is(err, store.ErrNotFound) {
		return c.JSON(http.StatusNotFound, models.ErrorResponse{Message: "页面不存在"})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "保存页面失败"})
	}
	page, _ = s.signComicPage(c.Request().Context(), page)
	return c.JSON(http.StatusOK, models.ComicPageResponse{Page: page})
}

func (s *Server) duplicateComicPage(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	page, err := s.store.DuplicateComicPage(c.Request().Context(), user.ID, c.Param("pageID"))
	if errors.Is(err, store.ErrNotFound) {
		return c.JSON(http.StatusNotFound, models.ErrorResponse{Message: "页面不存在"})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "复制页面失败"})
	}
	page, _ = s.signComicPage(c.Request().Context(), page)
	return c.JSON(http.StatusCreated, models.ComicPageResponse{Page: page})
}

func (s *Server) parseComicScript(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	var request models.ComicParseScriptRequest
	if err := c.Bind(&request); err != nil {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "拆书参数不正确"})
	}
	text := strings.TrimSpace(request.Text)
	if text == "" {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "请输入需要拆解的小说文本"})
	}
	if _, err := s.store.ConsumeCredits(c.Request().Context(), user.ID, comicCreditCost, "comic_script_parse", "comic_script", strings.TrimSpace(request.PageID)); errors.Is(err, store.ErrInsufficientCredits) {
		return c.JSON(http.StatusPaymentRequired, models.ErrorResponse{Message: "积分不足，拆书需要 3 积分"})
	} else if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "扣减积分失败"})
	}
	beats := parseComicBeats(text)
	var page *models.ComicPage
	var work *models.ComicWork
	if strings.TrimSpace(request.PageID) != "" {
		updated, err := s.store.UpdateComicPage(c.Request().Context(), user.ID, request.PageID, models.ComicUpdatePageRequest{ScriptBeats: beats, Status: "已拆解"})
		if err != nil {
			_, _ = s.store.AddCredits(c.Request().Context(), user.ID, comicCreditCost, "comic_script_parse_refund", "comic_script", strings.TrimSpace(request.PageID))
			if errors.Is(err, store.ErrNotFound) {
				return c.JSON(http.StatusNotFound, models.ErrorResponse{Message: "页面不存在"})
			}
			return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "保存拆解结果失败"})
		}
		updated, _ = s.signComicPage(c.Request().Context(), updated)
		page = &updated
	}
	assets := make([]models.ComicAsset, 0)
	for _, beat := range beats {
		for _, name := range beat.Assets {
			if len(assets) >= 6 {
				break
			}
			assetType := comicAssetTypeFromName(name)
			asset, err := s.store.CreateComicAsset(c.Request().Context(), user.ID, request.WorkID, assetType, name, beat.Summary, "", false)
			if err == nil {
				assets = append(assets, asset)
			}
		}
	}
	if strings.TrimSpace(request.WorkID) != "" {
		if loaded, err := s.store.GetComicWork(c.Request().Context(), user.ID, request.WorkID); err == nil {
			loaded, _ = s.signComicWork(c.Request().Context(), loaded)
			work = &loaded
		}
	}
	user, _ = s.store.GetUser(c.Request().Context(), user.ID)
	return c.JSON(http.StatusOK, models.ComicParseScriptResponse{Beats: beats, Assets: assets, Page: page, Work: work, Credits: comicCreditCost, User: &user})
}

func (s *Server) generateComicImage(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	var request models.ComicGenerateImageRequest
	if err := c.Bind(&request); err != nil {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "生成参数不正确"})
	}
	if strings.TrimSpace(request.AssetID) == "" {
		request.AssetID = c.Param("id")
	}
	prompt := strings.TrimSpace(request.Prompt)
	if prompt == "" {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "请输入生成提示词"})
	}
	n := normalizedGenerationCount(request.N)
	creditsCost := n * comicCreditCost
	refID := firstNonEmpty(strings.TrimSpace(request.PanelID), strings.TrimSpace(request.AssetID), strings.TrimSpace(request.PageID))
	if _, err := s.store.ConsumeCredits(c.Request().Context(), user.ID, creditsCost, "comic_image_generation", "comic_image", refID); errors.Is(err, store.ErrInsufficientCredits) {
		return c.JSON(http.StatusPaymentRequired, models.ErrorResponse{Message: "积分不足，每张漫画图片需要 3 积分"})
	} else if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "扣减积分失败"})
	}
	fullPrompt := buildComicImagePrompt(prompt, request)
	images, err := s.callAinaibaImage(c.Request().Context(), models.MangaGenerateRequest{
		Prompt:  fullPrompt,
		Images:  request.Images,
		N:       n,
		Size:    firstNonEmpty(request.Size, "1024x1360"),
		Quality: firstNonEmpty(request.Quality, "medium"),
	})
	if err != nil {
		_, _ = s.store.AddCredits(c.Request().Context(), user.ID, creditsCost, "comic_image_generation_refund", "comic_image", refID)
		return c.JSON(http.StatusBadGateway, models.ErrorResponse{Message: webImageErrorMessage(err)})
	}
	generated := make([]models.WebGeneratedImage, 0, len(images))
	for _, image := range images {
		item, err := s.persistGeneratedImage(c.Request().Context(), image)
		if err != nil {
			_, _ = s.store.AddCredits(c.Request().Context(), user.ID, creditsCost, "comic_image_generation_refund", "comic_image", refID)
			return c.JSON(http.StatusBadGateway, models.ErrorResponse{Message: "保存生成图片失败"})
		}
		generated = append(generated, item)
	}
	if len(generated) == 0 {
		_, _ = s.store.AddCredits(c.Request().Context(), user.ID, creditsCost, "comic_image_generation_refund", "comic_image", refID)
		return c.JSON(http.StatusBadGateway, models.ErrorResponse{Message: "生图服务没有返回图片"})
	}
	var asset *models.ComicAsset
	if strings.TrimSpace(request.AssetID) != "" {
		updated, err := s.store.UpdateComicAsset(c.Request().Context(), user.ID, request.AssetID, models.ComicAssetUpdateRequest{Src: generated[0].URL, Prompt: prompt})
		if err == nil {
			asset = &updated
		}
	} else if strings.TrimSpace(request.Type) != "" || strings.TrimSpace(request.Title) != "" || strings.TrimSpace(request.WorkID) != "" {
		created, err := s.store.CreateComicAsset(c.Request().Context(), user.ID, request.WorkID, request.Type, firstNonEmpty(request.Title, "漫画资产"), prompt, generated[0].URL, request.Favorite)
		if err == nil {
			asset = &created
		}
	}
	var page *models.ComicPage
	var work *models.ComicWork
	if request.ApplyToPage && strings.TrimSpace(request.PageID) != "" {
		loaded, err := s.store.UpdateComicPage(c.Request().Context(), user.ID, request.PageID, models.ComicUpdatePageRequest{Thumb: generated[0].URL, Status: "已生成"})
		if err == nil {
			loaded, _ = s.signComicPage(c.Request().Context(), loaded)
			page = &loaded
		}
	}
	if strings.TrimSpace(request.WorkID) != "" {
		if loaded, err := s.store.GetComicWork(c.Request().Context(), user.ID, request.WorkID); err == nil {
			loaded, _ = s.signComicWork(c.Request().Context(), loaded)
			work = &loaded
		}
	}
	responseImages, err := s.signGeneratedImages(c.Request().Context(), generated)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "生成图片访问链接失败"})
	}
	if asset != nil {
		signed, _ := s.signComicAsset(c.Request().Context(), *asset)
		asset = &signed
	}
	user, _ = s.store.GetUser(c.Request().Context(), user.ID)
	return c.JSON(http.StatusOK, models.ComicGenerateImageResponse{Images: responseImages, Asset: asset, Page: page, Work: work, Credits: creditsCost, User: &user})
}

func (s *Server) listComicAssets(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	favoritesOnly := c.QueryParam("favorite") == "true" || c.QueryParam("favorites") == "true"
	items, err := s.store.ListComicAssets(c.Request().Context(), user.ID, c.QueryParam("workID"), c.QueryParam("type"), favoritesOnly)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "加载资产失败"})
	}
	items, _ = s.signComicAssets(c.Request().Context(), items)
	return c.JSON(http.StatusOK, models.ComicAssetsResponse{Items: items})
}

func (s *Server) updateComicAsset(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	var request models.ComicAssetUpdateRequest
	if err := c.Bind(&request); err != nil {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "资产参数不正确"})
	}
	asset, err := s.store.UpdateComicAsset(c.Request().Context(), user.ID, c.Param("id"), request)
	if errors.Is(err, store.ErrNotFound) {
		return c.JSON(http.StatusNotFound, models.ErrorResponse{Message: "资产不存在"})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "保存资产失败"})
	}
	asset, _ = s.signComicAsset(c.Request().Context(), asset)
	return c.JSON(http.StatusOK, models.ComicAssetResponse{Asset: asset})
}

func (s *Server) favoriteComicAsset(c echo.Context) error {
	user, ok := s.requireUser(c)
	if !ok {
		return nil
	}
	var request models.ComicAssetFavoriteRequest
	if err := c.Bind(&request); err != nil {
		return c.JSON(http.StatusBadRequest, models.ErrorResponse{Message: "收藏参数不正确"})
	}
	asset, err := s.store.SetComicAssetFavorite(c.Request().Context(), user.ID, c.Param("id"), request.Favorite)
	if errors.Is(err, store.ErrNotFound) {
		return c.JSON(http.StatusNotFound, models.ErrorResponse{Message: "资产不存在"})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.ErrorResponse{Message: "更新收藏失败"})
	}
	asset, _ = s.signComicAsset(c.Request().Context(), asset)
	return c.JSON(http.StatusOK, models.ComicAssetResponse{Asset: asset})
}

func parseComicBeats(text string) []models.ComicScriptBeat {
	text = strings.TrimSpace(text)
	sentences := splitComicSentences(text)
	if len(sentences) == 0 {
		sentences = []string{text}
	}
	shots := []string{"远景", "中景", "中近景", "动态", "近景", "特写"}
	beats := make([]models.ComicScriptBeat, 0, 6)
	for index, sentence := range sentences {
		if index >= 6 {
			break
		}
		summary := strings.TrimSpace(sentence)
		if len([]rune(summary)) > 64 {
			summary = string([]rune(summary)[:64])
		}
		beats = append(beats, models.ComicScriptBeat{
			ID:       "beat-" + time.Now().UTC().Format("150405") + "-" + string(rune('1'+index)),
			Title:    "第 " + string(rune('1'+index)) + " 格  " + comicBeatTitle(summary, index),
			Shot:     shots[index%len(shots)],
			Summary:  summary,
			Dialogue: extractComicDialogue(sentence),
			Assets:   extractComicAssets(sentence, index),
		})
	}
	return beats
}

func splitComicSentences(text string) []string {
	parts := regexp.MustCompile(`[。！？!?；;\n]+`).Split(text, -1)
	var sentences []string
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			sentences = append(sentences, part)
		}
	}
	return sentences
}

func comicBeatTitle(summary string, index int) string {
	fallbacks := []string{"开场", "角色登场", "冲突逼近", "动作推进", "情绪停顿", "转折收束"}
	if summary == "" {
		return fallbacks[index%len(fallbacks)]
	}
	runes := []rune(summary)
	if len(runes) > 8 {
		runes = runes[:8]
	}
	return string(runes)
}

func extractComicDialogue(sentence string) string {
	for _, pair := range [][2]string{{"“", "”"}, {"\"", "\""}, {"「", "」"}} {
		start := strings.Index(sentence, pair[0])
		if start < 0 {
			continue
		}
		rest := sentence[start+len(pair[0]):]
		end := strings.Index(rest, pair[1])
		if end > 0 {
			return strings.TrimSpace(rest[:end])
		}
	}
	return ""
}

func extractComicAssets(sentence string, index int) []string {
	candidates := []string{"主角", "场景", "关键道具"}
	keywords := []struct {
		match string
		name  string
	}{
		{"雨", "雨夜场景"},
		{"城", "城市街景"},
		{"剑", "长剑"},
		{"火", "火把"},
		{"门", "门廊"},
		{"屋顶", "屋顶边缘"},
		{"少女", "少女角色"},
		{"少年", "少年角色"},
		{"士兵", "追兵士兵"},
	}
	for _, keyword := range keywords {
		if strings.Contains(sentence, keyword.match) {
			candidates = append(candidates, keyword.name)
		}
	}
	unique := make([]string, 0, 3)
	seen := map[string]bool{}
	for _, item := range candidates {
		if seen[item] {
			continue
		}
		seen[item] = true
		unique = append(unique, item)
		if len(unique) >= 3 {
			break
		}
	}
	return unique
}

func comicAssetTypeFromName(name string) string {
	if strings.Contains(name, "场") || strings.Contains(name, "街") || strings.Contains(name, "屋顶") || strings.Contains(name, "城") {
		return "场景"
	}
	if strings.Contains(name, "剑") || strings.Contains(name, "火") || strings.Contains(name, "道具") || strings.Contains(name, "门") {
		return "道具"
	}
	return "人物"
}

func buildComicImagePrompt(prompt string, request models.ComicGenerateImageRequest) string {
	parts := []string{prompt, "Create a polished manga/comic production asset. Keep character identity, linework, panel readability, and composition suitable for assembling comic pages."}
	if strings.TrimSpace(request.Type) != "" {
		parts = append(parts, "Asset type: "+strings.TrimSpace(request.Type)+".")
	}
	if strings.TrimSpace(request.Title) != "" {
		parts = append(parts, "Asset name: "+strings.TrimSpace(request.Title)+".")
	}
	if strings.TrimSpace(request.PanelID) != "" {
		parts = append(parts, "Generate as a finished comic panel image with dramatic storytelling composition.")
	}
	return strings.Join(parts, "\n\n")
}

func (s *Server) signComicWorks(ctx context.Context, items []models.ComicWork) ([]models.ComicWork, error) {
	signed := make([]models.ComicWork, 0, len(items))
	for _, item := range items {
		next, err := s.signComicWork(ctx, item)
		if err != nil {
			return nil, err
		}
		signed = append(signed, next)
	}
	return signed, nil
}

func (s *Server) signComicWork(ctx context.Context, item models.ComicWork) (models.ComicWork, error) {
	var err error
	item.Cover, err = s.signComicImageURL(ctx, item.Cover)
	if err != nil {
		return item, err
	}
	for episodeIndex := range item.Episodes {
		for pageIndex := range item.Episodes[episodeIndex].Pages {
			item.Episodes[episodeIndex].Pages[pageIndex], err = s.signComicPage(ctx, item.Episodes[episodeIndex].Pages[pageIndex])
			if err != nil {
				return item, err
			}
		}
	}
	return item, nil
}

func (s *Server) signComicPage(ctx context.Context, item models.ComicPage) (models.ComicPage, error) {
	var err error
	item.Thumb, err = s.signComicImageURL(ctx, item.Thumb)
	if err != nil {
		return item, err
	}
	for index := range item.Panels {
		item.Panels[index].Src, err = s.signComicImageURL(ctx, item.Panels[index].Src)
		if err != nil {
			return item, err
		}
	}
	return item, nil
}

func (s *Server) signComicAssets(ctx context.Context, items []models.ComicAsset) ([]models.ComicAsset, error) {
	signed := make([]models.ComicAsset, 0, len(items))
	for _, item := range items {
		next, err := s.signComicAsset(ctx, item)
		if err != nil {
			return nil, err
		}
		signed = append(signed, next)
	}
	return signed, nil
}

func (s *Server) signComicAsset(ctx context.Context, item models.ComicAsset) (models.ComicAsset, error) {
	var err error
	item.Src, err = s.signComicImageURL(ctx, item.Src)
	return item, err
}

func (s *Server) signComicImageURL(ctx context.Context, value string) (string, error) {
	if strings.TrimSpace(value) == "" {
		return value, nil
	}
	if bucket, key, ok := parseOSSStorageURI(value); ok {
		return s.signedOSSObjectURL(ctx, bucket, key, "")
	}
	if bucket, key, ok := parseR2StorageURI(value); ok {
		return s.signedR2ObjectURL(ctx, bucket, key)
	}
	return value, nil
}

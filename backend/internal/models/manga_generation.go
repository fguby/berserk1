package models

type MangaGenerateRequest struct {
	Prompt  string   `json:"prompt"`
	Images  []string `json:"images,omitempty"`
	N       int      `json:"n,omitempty"`
	Size    string   `json:"size,omitempty"`
	Quality string   `json:"quality,omitempty"`
}

type ComicScriptBeat struct {
	ID       string   `json:"id"`
	Title    string   `json:"title"`
	Shot     string   `json:"shot"`
	Summary  string   `json:"summary"`
	Dialogue string   `json:"dialogue,omitempty"`
	Assets   []string `json:"assets"`
}

type ComicPanel struct {
	ID      string `json:"id"`
	BeatID  string `json:"beatID,omitempty"`
	Layout  string `json:"layout,omitempty"`
	Src     string `json:"src,omitempty"`
	Caption string `json:"caption,omitempty"`
}

type ComicPage struct {
	ID          string            `json:"id"`
	EpisodeID   string            `json:"episodeID,omitempty"`
	Title       string            `json:"title"`
	Thumb       string            `json:"thumb,omitempty"`
	Status      string            `json:"status"`
	SortOrder   int               `json:"sortOrder"`
	ScriptBeats []ComicScriptBeat `json:"scriptBeats,omitempty"`
	Panels      []ComicPanel      `json:"panels,omitempty"`
	CreatedAt   string            `json:"createdAt,omitempty"`
	UpdatedAt   string            `json:"updatedAt,omitempty"`
}

type ComicEpisode struct {
	ID        string      `json:"id"`
	WorkID    string      `json:"workID,omitempty"`
	Title     string      `json:"title"`
	Status    string      `json:"status"`
	Summary   string      `json:"summary,omitempty"`
	SortOrder int         `json:"sortOrder"`
	Pages     []ComicPage `json:"pages"`
	CreatedAt string      `json:"createdAt,omitempty"`
	UpdatedAt string      `json:"updatedAt,omitempty"`
}

type ComicWork struct {
	ID        string         `json:"id"`
	UserID    string         `json:"userID,omitempty"`
	Title     string         `json:"title"`
	Subtitle  string         `json:"subtitle,omitempty"`
	Cover     string         `json:"cover,omitempty"`
	UpdatedAt string         `json:"updatedAt"`
	CreatedAt string         `json:"createdAt,omitempty"`
	Episodes  []ComicEpisode `json:"episodes"`
}

type ComicAsset struct {
	ID        string `json:"id"`
	WorkID    string `json:"workID,omitempty"`
	Type      string `json:"type"`
	Title     string `json:"title"`
	Prompt    string `json:"prompt,omitempty"`
	Src       string `json:"src"`
	Favorite  bool   `json:"favorite"`
	CreatedAt string `json:"createdAt,omitempty"`
	UpdatedAt string `json:"updatedAt,omitempty"`
}

type ComicWorksResponse struct {
	Items  []ComicWork  `json:"items"`
	Assets []ComicAsset `json:"assets,omitempty"`
}

type ComicWorkResponse struct {
	Work ComicWork `json:"work"`
	User *User     `json:"user,omitempty"`
}

type ComicEpisodeResponse struct {
	Episode ComicEpisode `json:"episode"`
	Work    ComicWork    `json:"work,omitempty"`
	User    *User        `json:"user,omitempty"`
}

type ComicPageResponse struct {
	Page ComicPage `json:"page"`
	Work ComicWork `json:"work,omitempty"`
	User *User     `json:"user,omitempty"`
}

type ComicAssetsResponse struct {
	Items []ComicAsset `json:"items"`
}

type ComicAssetResponse struct {
	Asset ComicAsset `json:"asset"`
	User  *User      `json:"user,omitempty"`
}

type ComicCreateWorkRequest struct {
	Title    string `json:"title"`
	Subtitle string `json:"subtitle,omitempty"`
	Cover    string `json:"cover,omitempty"`
}

type ComicCreateEpisodeRequest struct {
	Title   string `json:"title"`
	Summary string `json:"summary,omitempty"`
}

type ComicCreatePageRequest struct {
	Title string `json:"title"`
	Thumb string `json:"thumb,omitempty"`
}

type ComicUpdatePageRequest struct {
	Title       string            `json:"title,omitempty"`
	Thumb       string            `json:"thumb,omitempty"`
	Status      string            `json:"status,omitempty"`
	ScriptBeats []ComicScriptBeat `json:"scriptBeats,omitempty"`
	Panels      []ComicPanel      `json:"panels,omitempty"`
}

type ComicParseScriptRequest struct {
	WorkID    string `json:"workID,omitempty"`
	EpisodeID string `json:"episodeID,omitempty"`
	PageID    string `json:"pageID,omitempty"`
	Text      string `json:"text"`
}

type ComicParseScriptResponse struct {
	Beats   []ComicScriptBeat `json:"beats"`
	Assets  []ComicAsset      `json:"assets"`
	Page    *ComicPage        `json:"page,omitempty"`
	Work    *ComicWork        `json:"work,omitempty"`
	Credits int               `json:"credits"`
	User    *User             `json:"user,omitempty"`
}

type ComicGenerateImageRequest struct {
	WorkID      string   `json:"workID,omitempty"`
	PageID      string   `json:"pageID,omitempty"`
	PanelID     string   `json:"panelID,omitempty"`
	AssetID     string   `json:"assetID,omitempty"`
	Type        string   `json:"type,omitempty"`
	Title       string   `json:"title,omitempty"`
	Prompt      string   `json:"prompt"`
	Images      []string `json:"images,omitempty"`
	N           int      `json:"n,omitempty"`
	Size        string   `json:"size,omitempty"`
	Quality     string   `json:"quality,omitempty"`
	Favorite    bool     `json:"favorite,omitempty"`
	ApplyToPage bool     `json:"applyToPage,omitempty"`
}

type ComicGenerateImageResponse struct {
	Images  []WebGeneratedImage `json:"images"`
	Asset   *ComicAsset         `json:"asset,omitempty"`
	Page    *ComicPage          `json:"page,omitempty"`
	Work    *ComicWork          `json:"work,omitempty"`
	Credits int                 `json:"credits"`
	User    *User               `json:"user,omitempty"`
}

type ComicAssetFavoriteRequest struct {
	Favorite bool `json:"favorite"`
}

type ComicAssetUpdateRequest struct {
	Type     string `json:"type,omitempty"`
	Title    string `json:"title,omitempty"`
	Prompt   string `json:"prompt,omitempty"`
	Src      string `json:"src,omitempty"`
	Favorite *bool  `json:"favorite,omitempty"`
}

type WebImageGenerateRequest struct {
	Prompt         string   `json:"prompt"`
	Style          string   `json:"style,omitempty"`
	ModelID        string   `json:"modelID,omitempty"`
	Images         []string `json:"images,omitempty"`
	N              int      `json:"n,omitempty"`
	Size           string   `json:"size,omitempty"`
	Quality        string   `json:"quality,omitempty"`
	NegativePrompt string   `json:"negativePrompt,omitempty"`
	Resolution     string   `json:"resolution,omitempty"`
	LockedSeed     bool     `json:"lockedSeed,omitempty"`
}

type WebGeneratedImage struct {
	URL          string `json:"url"`
	ThumbnailURL string `json:"thumbnailURL,omitempty"`
	TextureURL   string `json:"textureURL,omitempty"`
	MimeType     string `json:"mimeType"`
}

type ImageModel struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Provider    string `json:"provider,omitempty"`
	Description string `json:"description,omitempty"`
	CreditCost  int    `json:"creditCost"`
	Enabled     bool   `json:"enabled"`
}

type ImageModelsResponse struct {
	Items []ImageModel `json:"items"`
}

type WebGalleryImage struct {
	ID               string `json:"id"`
	UserID           string `json:"userID,omitempty"`
	Author           string `json:"author,omitempty"`
	AuthorAvatarURL  string `json:"authorAvatarURL,omitempty"`
	Image            string `json:"image"`
	ThumbnailURL     string `json:"thumbnailURL,omitempty"`
	TextureURL       string `json:"textureURL,omitempty"`
	Prompt           string `json:"prompt"`
	Style            string `json:"style,omitempty"`
	ModelID          string `json:"modelID,omitempty"`
	ModelName        string `json:"modelName,omitempty"`
	Tag              string `json:"tag,omitempty"`
	Ratio            string `json:"ratio"`
	Size             string `json:"size,omitempty"`
	Quality          string `json:"quality,omitempty"`
	CreditsCost      int    `json:"creditsCost,omitempty"`
	IsPublic         bool   `json:"isPublic"`
	IsFeatured       bool   `json:"isFeatured"`
	IsPromptFeatured bool   `json:"isPromptFeatured"`
	LikeCount        int    `json:"likeCount"`
	LikedByMe        bool   `json:"likedByMe"`
	FavoriteCount    int    `json:"favoriteCount"`
	FavoritedByMe    bool   `json:"favoritedByMe"`
	CreatedAt        string `json:"createdAt"`
}

type WebGalleryResponse struct {
	Items []WebGalleryImage `json:"items"`
}

type WebImageGenerateResponse struct {
	Images    []WebGeneratedImage `json:"images"`
	Prompt    string              `json:"prompt"`
	Style     string              `json:"style,omitempty"`
	ModelID   string              `json:"modelID,omitempty"`
	ModelName string              `json:"modelName,omitempty"`
	Size      string              `json:"size"`
	Quality   string              `json:"quality"`
	Credits   int                 `json:"credits"`
	User      *User               `json:"user,omitempty"`
	CreatedAt string              `json:"createdAt"`
}

type WebImageTask struct {
	ID             string `json:"id"`
	UserID         string `json:"userID,omitempty"`
	Prompt         string `json:"prompt"`
	Style          string `json:"style,omitempty"`
	ModelID        string `json:"modelID,omitempty"`
	ModelName      string `json:"modelName,omitempty"`
	Size           string `json:"size,omitempty"`
	Quality        string `json:"quality,omitempty"`
	N              int    `json:"n"`
	CreditsCost    int    `json:"creditsCost"`
	Status         string `json:"status"`
	ErrorMessage   string `json:"errorMessage,omitempty"`
	ResultImage    string `json:"resultImage,omitempty"`
	TextureURL     string `json:"textureURL,omitempty"`
	ResultMimeType string `json:"resultMimeType,omitempty"`
	GalleryImageID string `json:"galleryImageID,omitempty"`
	IsPublic       bool   `json:"isPublic"`
	CreatedAt      string `json:"createdAt"`
	StartedAt      string `json:"startedAt,omitempty"`
	CompletedAt    string `json:"completedAt,omitempty"`
	UpdatedAt      string `json:"updatedAt,omitempty"`
}

type WebImageTaskResponse struct {
	Task WebImageTask `json:"task"`
	User *User        `json:"user,omitempty"`
}

type WebImageTasksResponse struct {
	Items []WebImageTask `json:"items"`
}

type WebImageTaskVisibilityRequest struct {
	IsPublic bool `json:"isPublic"`
}

type WebGalleryLikeRequest struct {
	Liked bool `json:"liked"`
}

type WebGalleryLikeResponse struct {
	Item WebGalleryImage `json:"item"`
}

type WebGalleryFavoriteRequest struct {
	Favorited bool `json:"favorited"`
}

type WebGalleryFavoriteResponse struct {
	Item WebGalleryImage `json:"item"`
}

type WebGalleryFeaturedRequest struct {
	IsFeatured       bool `json:"isFeatured"`
	IsPromptFeatured bool `json:"isPromptFeatured"`
}

type WebGalleryFeaturedResponse struct {
	Item WebGalleryImage `json:"item"`
}

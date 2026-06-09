import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookImage,
  Brush,
  ChevronLeft,
  ChevronDown,
  Compass,
  Copy,
  Download,
  Flame,
  Gift,
  Eye,
  EyeOff,
  Home,
  Hash,
  Image as ImageIcon,
  ImagePlus,
  KeyRound,
  LayoutTemplate,
  Link2,
  LoaderCircle,
  Lock,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  MousePointer2,
  Moon,
  Move,
  Palette,
  PanelTop,
  PanelsTopLeft,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Type,
  Languages,
  Unlock,
  UserRound,
  Video,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';

const DEFAULT_API_BASE_URL = 'https://neo-ai.pw/berserk';
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, '');
const AUTH_APP_ID = 'berserk.web';
const AUTH_STORAGE_KEY = 'berserk-ai-auth-session';
const STYLE_FAVORITES_KEY = 'berserk-ai-style-favorites';
const CREDIT_ADJUSTMENT_NOTICE_KEY = 'berserk-ai-credit-adjustment-notices';
const IMAGE_PUBLIC_NOTICE_KEY = 'berserk-ai-image-public-notice';
const INVITE_CODE_STORAGE_KEY = 'berserk-ai-invite-code';
const IMAGE_CREDIT_COST = 3;

const navItems = [
  { label: '主页', icon: Home, view: 'home' },
  { label: '收藏', icon: Star, view: 'favorites' },
  { label: '生成记录', icon: RefreshCw, view: 'history' },
  { label: '个人中心', icon: Settings, view: 'profile' },
];

const aiAppItems = [
  { label: '角色创建器', icon: UserRound },
  { label: 'AI 动漫生成器', icon: ImageIcon },
  { label: 'AI 漫画', icon: PanelsTopLeft, tool: 'comic-studio' },
  { label: '格式/尺寸修改器', icon: LayoutTemplate, tool: 'size-editor' },
  { label: '线稿上色', icon: Palette },
  { label: 'AI 动画制作工具', icon: Video },
];

const comicScriptBeats = [];
const comicPanelsSeed = [];
const comicAssetsSeed = [];
const comicQueueSeed = [];
const comicWorksSeed = [];
const emptyComicBeat = { id: '', title: '未选择分镜', shot: '', summary: '', dialogue: '', assets: [] };
const emptyComicPanel = { id: '', beatID: '', src: '', caption: '', layout: 'wide' };

function normalizeComicPage(page = {}) {
  return {
    id: page.id || `page-${Date.now()}`,
    episodeID: page.episodeID || '',
    title: page.title || '第 1 页',
    thumb: page.thumb || '',
    status: page.status || '草稿',
    sortOrder: page.sortOrder || 0,
    scriptBeats: Array.isArray(page.scriptBeats) ? page.scriptBeats : [],
    panels: Array.isArray(page.panels) ? page.panels : [],
    createdAt: page.createdAt || '',
    updatedAt: page.updatedAt || '',
  };
}

function normalizeComicEpisode(episode = {}) {
  return {
    id: episode.id || `ep-${Date.now()}`,
    workID: episode.workID || '',
    title: episode.title || '第 1 话 · 未命名章节',
    status: episode.status || '草稿',
    summary: episode.summary || '',
    sortOrder: episode.sortOrder || 0,
    pages: (episode.pages || []).map(normalizeComicPage),
    createdAt: episode.createdAt || '',
    updatedAt: episode.updatedAt || '',
  };
}

function normalizeComicWork(work = {}) {
  return {
    id: work.id || `work-${Date.now()}`,
    title: work.title || '新漫画作品',
    subtitle: work.subtitle || '草稿',
    cover: work.cover || '',
    updatedAt: formatComicUpdatedAt(work.updatedAt),
    createdAt: work.createdAt || '',
    episodes: (work.episodes || []).map(normalizeComicEpisode),
  };
}

function normalizeComicAsset(asset = {}) {
  return {
    id: asset.id || `asset-${Date.now()}`,
    workID: asset.workID || '',
    type: asset.type || '人物',
    title: asset.title || '未命名资产',
    prompt: asset.prompt || '',
    src: asset.src || '',
    favorite: Boolean(asset.favorite),
    createdAt: asset.createdAt || '',
    updatedAt: asset.updatedAt || '',
  };
}

function mergeComicAssets(current, incoming) {
  const seen = new Set();
  return [...incoming, ...current].filter((asset) => {
    const key = asset.id || `${asset.type}-${asset.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isBackendID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function formatComicUpdatedAt(value) {
  if (!value) return '刚刚';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))} 分钟前`;
  if (diff < 86_400_000) return `${Math.max(1, Math.round(diff / 3_600_000))} 小时前`;
  return date.toLocaleDateString('zh-CN');
}
const filterChips = [
  { label: '所有帖子' },
  { label: '精选', active: true, icon: Star },
  { label: '效果', icon: LayoutTemplate },
  { label: '动画片', icon: Video },
  { label: '音乐', icon: Sparkles },
  { label: '幻灯片', icon: BookImage },
  { label: 'NeoAIConfession', featured: true },
  { label: '场景', hash: true },
  { label: 'OC', hash: true },
  { label: '可爱' },
  { label: '毛茸茸的' },
  { label: '船' },
  { label: '老婆' },
  { label: '丈夫' },
  { label: '同性爱' },
  { label: '女同性爱' },
  { label: 'NSFW' },
  { label: '原神' },
];

const generationSizes = ['自动', '1:1', '3:4', '4:5', '2:3', '9:16', '4:3', '5:4', '3:2', '16:9', '21:9'];

const styleCategories = [
  { id: 'favorites', label: '收藏' },
  { id: 'art', label: '艺术' },
  { id: 'meme', label: '梗图' },
  { id: 'painterly', label: '绘画感' },
  { id: 'chibi', label: 'Q版' },
  { id: 'male', label: '男性向' },
  { id: 'anime', label: '动漫' },
  { id: 'manga', label: '漫画' },
  { id: 'sketch', label: '素描' },
  { id: 'furry', label: '毛茸茸' },
  { id: '3d', label: '3D' },
  { id: 'flat', label: '扁平' },
  { id: 'general', label: '通用' },
  { id: 'custom', label: '自定义' },
];

const stylePresets = [
  { name: '鲜艳动漫风', category: 'art', image: 'https://komiko.app/images/kusa_styles/vibrant_anime.webp' },
  { name: '高反差亮面风', category: 'art', image: 'https://komiko.app/images/kusa_styles/high_contrast_glossy.webp' },
  { name: '漆面插画', category: 'art', image: 'https://komiko.app/images/kusa_styles/lacquered_illustration.webp' },
  { name: '半写实肖像', category: 'art', image: 'https://komiko.app/images/kusa_styles/semi_realistic_portrait.webp' },
  { name: '柔和粉彩', category: 'painterly', image: 'https://komiko.app/images/kusa_styles/soft_pastel.webp' },
  { name: '褪色画布', category: 'painterly', image: 'https://dihulvhqvmoxyhkxovko.supabase.co/storage/v1/object/public/husbando-land/assets/kusa_styles/faded-canvas-style.png' },
  { name: '柔光插画', category: 'painterly', image: 'https://komiko.app/images/kusa_styles/soft_light_illustration.webp' },
  { name: '晶体锐边', category: 'anime', image: 'https://dihulvhqvmoxyhkxovko.supabase.co/storage/v1/object/public/husbando-land/assets/kusa_styles/crystal-edge-style.png' },
  { name: '虹彩质感', category: 'anime', image: 'https://komiko.app/images/kusa_styles/iridescent_new.webp' },
  { name: '水彩插画', category: 'painterly', image: 'https://dihulvhqvmoxyhkxovko.supabase.co/storage/v1/object/public/husbando-land/assets/watercolor_Illustration.webp' },
  { name: '高光插画', category: 'anime', image: 'https://komiko.app/images/kusa_styles/high_gloss_illustration.webp' },
  { name: '甜系粉彩', category: 'chibi', image: 'https://komiko.app/images/kusa_styles/sweet_pastel.webp' },
  { name: '闪耀插画', category: 'anime', image: 'https://komiko.app/images/kusa_styles/dazzling_illustration.webp' },
  { name: '柔和阴影', category: 'manga', image: 'https://komiko.app/images/kusa_styles/soft_shading_new.webp' },
  { name: '低饱和插画', category: 'manga', image: 'https://komiko.app/images/kusa_styles/desaturated_illustration_new.webp' },
  { name: '亮面动漫', category: 'anime', image: 'https://komiko.app/images/kusa_styles/glossy_anime_new.webp' },
  { name: '干净线稿', category: 'sketch', image: 'https://komiko.app/images/kusa_styles/clean_lines.webp' },
  { name: '流行卡通', category: 'flat', image: 'https://komiko.app/images/kusa_styles/pop_toon_style.webp' },
  { name: '柔和像素', category: '3d', image: 'https://komiko.app/images/kusa_styles/soft_pixel_art.webp' },
  { name: '氛围发光', category: 'general', image: 'https://komiko.app/images/kusa_styles/moody_glow_style.webp' },
  { name: '柔萌阴影', category: 'chibi', image: 'https://komiko.app/images/kusa_styles/soft_shaded_moe_style.webp' },
  { name: '赛博糖果', category: 'meme', image: 'https://komiko.app/images/kusa_styles/cyber_candy.webp' },
  { name: '幻想龙族', category: 'furry', image: 'https://dihulvhqvmoxyhkxovko.supabase.co/storage/v1/object/public/husbando-land/assets/kusa_styles/fantasy-dragon-style.webp' },
  { name: '男性奇幻', category: 'male', image: 'https://komiko.app/images/kusa_styles/katsuya_terada_inspired_fantasy_art.webp' },
  { name: '自定义示例', category: 'custom', image: 'https://komiko.app/images/kusa_styles/mischiefstyle.webp' },
];

const creditPackages = [
  {
    id: 'credits_trial',
    name: '限时体验包',
    price: '¥1',
    credits: '10 积分',
    icon: '/pricing-icons/package-trial.png',
    tone: 'blue',
    features: ['限时体验专享', '可生成约 3 张基础模型图片', '适合测试出图流程', '购买后立即到账'],
  },
  {
    id: 'credits_100',
    name: '灵感入门包',
    price: '¥10',
    credits: '110 积分',
    icon: '/pricing-icons/package-100.png',
    tone: 'blue',
    features: ['适合轻量试用', '可生成约 36 张图片', '购买后立即到账', '积分长期保留'],
  },
  {
    id: 'credits_500',
    name: '创作加速包',
    price: '¥49',
    credits: '550 积分',
    icon: '/pricing-icons/package-500.png',
    popular: true,
    tone: 'purple',
    features: ['适合日常创作', '可生成约 183 张图片', '比入门包更划算', '购买后立即到账'],
  },
  {
    id: 'credits_1000',
    name: '高频创作包',
    price: '¥95',
    credits: '1,100 积分',
    icon: '/pricing-icons/package-1000.png',
    tone: 'gold',
    features: ['适合高频出图', '可生成约 366 张图片', '批量探索不同风格', '购买后立即到账'],
  },
];

const pricingFaqs = [
  { question: '积分如何消耗？', answer: '图片生成已调整为 3 积分/张。实际消耗会在生成按钮处展示。' },
  { question: '购买后多久到账？', answer: '如果是站内直接购买会立即到账；通过卡密平台购买时，拿到卡号和密码后在订阅页兑换，兑换成功后积分立即进入当前账号。' },
  { question: '积分会过期吗？', answer: '当前积分长期保留，不会按月清零。后续如果调整有效期，会提前在页面和公告里说明。' },
  { question: '支持哪些支付方式？', answer: '支付方式由配置的卡密平台决定。平台支付完成后会提供卡号和密码，你回到这里兑换即可。' },
  { question: '生成失败会退还积分吗？', answer: '会。后端任务失败时会按本次任务消耗自动退回积分，避免因为接口或模型异常造成损失。' },
  { question: '可以多次购买积分包吗？', answer: '可以。积分包可以重复购买和兑换，多次兑换的积分会累加到同一个账号余额中。' },
];

const defaultImageModels = [
  { id: 'gpt-image', name: 'GPT Image', provider: 'OpenAI', creditCost: IMAGE_CREDIT_COST },
  { id: 'seedream', name: 'Seedream', provider: 'ByteDance', creditCost: IMAGE_CREDIT_COST },
  { id: 'qwen-image', name: 'Qwen Image', provider: 'Alibaba', creditCost: IMAGE_CREDIT_COST },
];

function tagsFromImages(items) {
  const source = items
    .slice(0, 24)
    .flatMap((item) => [item.title, item.promptZh, item.style, item.model])
    .join(' ');
  const dictionary = [
    ['海报', /海报|广告|品牌|商业/],
    ['产品图', /产品|手袋|饮料|香水|包装/],
    ['动漫', /动漫|角色|插画|二次元/],
    ['人物', /人物|女性|男性|模特|肖像/],
    ['机甲', /机甲|机械|未来/],
    ['风景', /风景|山|城市|自然|街头/],
    ['建筑', /建筑|空间|室内/],
    ['可爱', /可爱|猫|萌|Q版/],
    ['幻想', /奇幻|魔法|梦幻|冒险/],
    ['赛博朋克', /赛博|霓虹|未来感/],
  ];
  const tags = dictionary.filter(([, pattern]) => pattern.test(source)).map(([label]) => label);
  return Array.from(new Set(['小说封面', '所有帖子', '精选', ...tags, 'NeoAIConfession', 'OC', 'NSFW'])).slice(0, 18);
}

function normalizeGalleryItem(item) {
  const prompt = item.prompt || '';
  const style = item.style || item.tag || '作品';
  const imageURL = item.image || '';
  const thumbnailURL = item.thumbnailURL || '';
  let [width, height] = parseImageSize(item.size, item.ratio);
  const explicitWidth = Number(item.width);
  const explicitHeight = Number(item.height);
  if (explicitWidth > 0 && explicitHeight > 0) {
    width = explicitWidth;
    height = explicitHeight;
  }
  return {
    id: item.id,
    title: style,
    promptZh: prompt,
    src: thumbnailURL || imageURL,
    fullSrc: imageURL,
    textureSrc: item.textureURL || textureProxyURLFor(imageURL) || textureProxyURLFor(thumbnailURL) || thumbnailURL || imageURL,
    width,
    height,
    author: item.author || 'Neo AI',
    authorAvatarURL: item.authorAvatarURL || '/assets/berserk-ai-icon.png',
    likes: item.likeCount || 0,
    likeCount: item.likeCount || 0,
    likedByMe: Boolean(item.likedByMe),
    favoritedByMe: Boolean(item.favoritedByMe),
    favoriteCount: item.favoriteCount || 0,
    modelID: item.modelID || '',
    model: item.modelName || item.model || 'GPT Image',
    style,
    isFeatured: Boolean(item.isFeatured),
    isPromptFeatured: Boolean(item.isPromptFeatured),
    createdAt: item.createdAt,
  };
}

function mergeGalleryItems(current, incoming) {
  const seen = new Set();
  const merged = [];
  [...current, ...incoming].forEach((item) => {
    if (!item?.id || seen.has(item.id)) return;
    seen.add(item.id);
    merged.push(item);
  });
  return merged;
}

function textureProxyURLFor(value) {
  if (!value) return '';
  try {
    const parsed = new URL(value, window.location.origin);
    if (!parsed.hostname.endsWith('.r2.cloudflarestorage.com')) return '';
    const [bucket] = parsed.hostname.split('.');
    const key = parsed.pathname.replace(/^\/+/, '');
    if (!bucket || !key) return '';
    const params = new URLSearchParams({ bucket, key, provider: 'r2' });
    return `${API_BASE_URL}/api/v1/images/proxy?${params.toString()}`;
  } catch {
    return '';
  }
}

function parseImageSize(size, ratio) {
  const match = String(size || '').match(/(\d+)\s*x\s*(\d+)/i);
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width > 0 && height > 0) return [width, height];
  }
  if (ratio === 'landscape') return [1360, 1024];
  if (ratio === 'square') return [1024, 1024];
  return [1024, 1360];
}

function modelIconFor(model) {
  const id = String(model?.id || model?.modelID || '').toLowerCase();
  const provider = String(model?.provider || model?.model || model?.name || '').toLowerCase();
  if (id.includes('gemini') || provider.includes('google') || provider.includes('gemini')) return 'https://cdn.simpleicons.org/google/4285F4';
  if (id.includes('qwen') || provider.includes('alibaba') || provider.includes('aliyun')) return 'https://cdn.simpleicons.org/alibabacloud/FF6A00';
  if (id.includes('seed') || provider.includes('byte') || provider.includes('doubao')) return 'https://cdn.simpleicons.org/bytedance/111111';
  return '/assets/openai-logo.svg';
}

function App() {
  const [authOpen, setAuthOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [authSession, setAuthSession] = useState(() => readStoredAuthSession());
  const [theme, setTheme] = useState('light');
  const [view, setView] = useState('home');
  const [profileOpen, setProfileOpen] = useState(false);
  const [feedItems, setFeedItems] = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [galleryQuery, setGalleryQuery] = useState('');
  const [gallerySort, setGallerySort] = useState('updated');
  const [imageModels, setImageModels] = useState(defaultImageModels);
  const [packageItems, setPackageItems] = useState(creditPackages);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sizeEditorOpen, setSizeEditorOpen] = useState(false);
  const [comicStudioOpen, setComicStudioOpen] = useState(false);
  const [generationTasks, setGenerationTasks] = useState([]);
  const [taskNotice, setTaskNotice] = useState('');
  const [appModal, setAppModal] = useState(null);
  const [galleryRefreshKey, setGalleryRefreshKey] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const feedRequestRef = useRef(0);
  const previousActiveTaskCountRef = useRef(0);
  const pendingTaskCount = generationTasks.filter((task) => ['queued', 'running'].includes(task.status)).length;
  const galleryAuthKey = view === 'favorites' ? authSession?.token || '' : '';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('ref') || params.get('invite');
    if (inviteCode) window.localStorage.setItem(INVITE_CODE_STORAGE_KEY, inviteCode.trim());
  }, []);

  useEffect(() => {
    getJSON('/api/v1/images/models')
      .then((payload) => {
        if (Array.isArray(payload?.items) && payload.items.length > 0) setImageModels(payload.items);
      })
      .catch(() => {});
    getJSON('/api/v1/credits/packages')
      .then((payload) => {
        if (Array.isArray(payload?.items) && payload.items.length > 0) {
          setPackageItems(payload.items.map(normalizeCreditPackage));
        }
      })
      .catch(() => {});
  }, []);

  const loadGalleryPage = ({ reset = false } = {}) => {
    if (view === 'history' || view === 'pricing') return;
    if (view === 'favorites' && !authSession?.token) {
      setFeedItems([]);
      setFeedLoading(false);
      setFeedLoadingMore(false);
      setFeedHasMore(false);
      setFeedError('请先登录后查看收藏。');
      setAuthOpen(true);
      return;
    }
    if (reset) {
      setFeedLoading(true);
      setFeedItems([]);
      setFeedHasMore(false);
    } else {
      if (feedLoadingMore || !feedHasMore) return;
      setFeedLoadingMore(true);
    }
    const requestID = ++feedRequestRef.current;
    const favoriteQuery = view === 'favorites' ? '&favorite=true' : '';
    const searchQuery = galleryQuery ? `&q=${encodeURIComponent(galleryQuery)}` : '';
    const sortQuery = gallerySort === 'updated' ? '' : `&sort=${encodeURIComponent(gallerySort)}`;
    const currentItems = reset ? [] : feedItems;
    const beforeQuery = !reset && currentItems.length > 0 ? `&before=${encodeURIComponent(currentItems[currentItems.length - 1].id)}` : '';
    getJSON(`/api/v1/images/gallery?limit=10${favoriteQuery}${searchQuery}${sortQuery}${beforeQuery}`, authSession?.token)
      .then(async (payload) => {
        const nextItems = (payload?.items || []).map(normalizeGalleryItem);
        await preloadGalleryImages(nextItems.map((item) => item.src));
        if (requestID !== feedRequestRef.current) return;
        setFeedItems((items) => mergeGalleryItems(reset ? [] : items, nextItems));
        setFeedHasMore(nextItems.length >= 10);
        setFeedError('');
      })
      .catch((error) => {
        if (requestID !== feedRequestRef.current) return;
        setFeedError(getErrorMessage(error, '图库加载失败'));
        if (reset) setFeedItems([]);
      })
      .finally(() => {
        if (requestID !== feedRequestRef.current) return;
        setFeedLoading(false);
        setFeedLoadingMore(false);
      });
  };

  useEffect(() => {
    loadGalleryPage({ reset: true });
    return () => {
      feedRequestRef.current += 1;
    };
  }, [galleryAuthKey, view, galleryQuery, gallerySort, galleryRefreshKey]);

  const loadGenerationTasks = async () => {
    if (!authSession?.token) {
      setGenerationTasks([]);
      previousActiveTaskCountRef.current = 0;
      return [];
    }
    const payload = await getJSON('/api/v1/images/tasks?limit=30', authSession.token);
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const activeCount = items.filter((task) => ['queued', 'running'].includes(task.status)).length;
    if (previousActiveTaskCountRef.current > 0 && activeCount === 0) {
      setGalleryRefreshKey((value) => value + 1);
    }
    previousActiveTaskCountRef.current = activeCount;
    setGenerationTasks(items);
    return items;
  };

  useEffect(() => {
    if (!authSession?.token) {
      setGenerationTasks([]);
      previousActiveTaskCountRef.current = 0;
      return undefined;
    }
    let cancelled = false;
    const refresh = () => {
      loadGenerationTasks().catch(() => {
        if (!cancelled) setGenerationTasks([]);
      });
    };
    refresh();
    const timer = window.setInterval(refresh, pendingTaskCount > 0 ? 4500 : 12000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authSession?.token, pendingTaskCount]);

  useEffect(() => {
    if (!authSession?.token) return undefined;
    let cancelled = false;
    getJSON('/api/v1/me', authSession.token)
      .then((user) => {
        if (cancelled || !user?.id) return;
        setAuthSession((session) => {
          if (!session?.token) return session;
          const nextSession = { ...session, user };
          window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
          return nextSession;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authSession?.token]);

  useEffect(() => {
    const notice = authSession?.user?.creditAdjustment;
    if (!notice?.id || Number(notice.amount || 0) <= 0) return;
    const seen = readCreditAdjustmentNotices();
    const noticeKey = `${authSession.user?.id || 'user'}:${notice.id}:${notice.amount}`;
    if (seen.includes(noticeKey)) return;
    window.localStorage.setItem(CREDIT_ADJUSTMENT_NOTICE_KEY, JSON.stringify([...seen, noticeKey]));
    setAppModal({
      tone: 'success',
      title: notice.title || '积分已补偿到账',
      message: `${notice.message || '图片生成价格已调整，系统已为你补回历史差额积分。'} 本次补偿 ${Number(notice.amount).toLocaleString('zh-CN')} 积分。`,
    });
  }, [authSession?.user?.creditAdjustment?.id, authSession?.user?.creditAdjustment?.amount, authSession?.user?.id]);

  useEffect(() => {
    if (window.localStorage.getItem(IMAGE_PUBLIC_NOTICE_KEY) === 'seen') return undefined;
    let timer = 0;
    let attempts = 0;
    const showNotice = () => {
      setAppModal((current) => {
        if (current && attempts < 4) {
          attempts += 1;
          timer = window.setTimeout(showNotice, 1200);
          return current;
        }
        window.localStorage.setItem(IMAGE_PUBLIC_NOTICE_KEY, 'seen');
        return {
          tone: 'info',
          title: '图片默认不公开',
          message: '新生成的图片默认仅自己可见，不会出现在首页。你可以在生成记录里打开公开开关，公开后才会进入首页图库。',
        };
      });
    };
    timer = window.setTimeout(showNotice, 900);
    return () => window.clearTimeout(timer);
  }, []);

  const handleAuthSuccess = (session) => {
    setAuthSession(session);
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    setAuthOpen(false);
  };

  const handleLogout = () => {
    setAuthSession(null);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const handleSessionUser = (user) => {
    if (!authSession || !user) return;
    const nextSession = { ...authSession, user };
    setAuthSession(nextSession);
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
  };

  const handleGenerateImage = async ({
    prompt,
    style,
    size = '3:4',
    modelID,
    images = [],
    quality = 'medium',
    n = 1,
    negativePrompt = '',
    resolution = 'auto',
    lockedSeed = false,
  }) => {
    if (!authSession?.token) {
      setAuthOpen(true);
      return;
    }
    const payload = await authPostJSON('/api/v1/images/tasks', authSession.token, {
      prompt,
      style,
      size: sizeToBackendSize(size),
      quality,
      n,
      modelID,
      images,
      negativePrompt,
      resolution,
      lockedSeed,
    }, '生成失败');
    if (payload?.user) handleSessionUser(payload.user);
    if (payload?.task) {
      setTaskNotice('图片已进入生成队列，默认仅自己可见。你可以在生成记录里查看进度，并按需开启公开。');
      setGenerationTasks((items) => [payload.task, ...items.filter((task) => task.id !== payload.task.id)]);
      previousActiveTaskCountRef.current = Math.max(1, previousActiveTaskCountRef.current);
      return;
    }
    const created = (payload?.images || []).map((image, index) => ({
      id: `generated-${Date.now()}-${index}`,
      title: prompt.slice(0, 24) || '新生成图片',
      promptZh: prompt,
      src: image.thumbnailURL || image.url,
      fullSrc: image.url,
      textureSrc: image.textureURL || textureProxyURLFor(image.url) || textureProxyURLFor(image.thumbnailURL) || image.thumbnailURL || image.url,
      width: 1024,
      height: size.includes('16:9') || size.includes('4:3') || size.includes('21:9') ? 768 : 1365,
      author: authSession.user?.displayName || authSession.user?.email || 'Neo AI',
      likes: 0,
      likeCount: 0,
      likedByMe: false,
      model: payload?.modelName || imageModels.find((model) => model.id === modelID)?.name || 'GPT Image',
      authorAvatarURL: authSession.user?.avatarURL || '/assets/berserk-ai-icon.png',
      isFeatured: false,
      isPromptFeatured: false,
      isPublic: false,
    }));
    if (created.length > 0) {
      setSelectedImage(created[0]);
      setTaskNotice('图片已生成，默认仅自己可见，不会出现在首页。');
    }
  };

  const handleTaskVisibilityChange = async (task, isPublic) => {
    if (!authSession?.token) {
      setAuthOpen(true);
      return;
    }
    setGenerationTasks((items) => items.map((candidate) => (candidate.id === task.id ? { ...candidate, isPublic } : candidate)));
    try {
      const payload = await authPatchJSON(`/api/v1/images/tasks/${task.id}/public`, authSession.token, { isPublic }, '公开设置失败');
      const nextTask = payload?.task || { ...task, isPublic };
      setGenerationTasks((items) => items.map((candidate) => (candidate.id === task.id ? nextTask : candidate)));
      const galleryImageID = nextTask.galleryImageID || task.galleryImageID;
      if (!isPublic && galleryImageID) {
        setFeedItems((items) => items.filter((item) => item.id !== galleryImageID));
        setSelectedImage((current) => (current?.id === galleryImageID ? null : current));
      }
      if (isPublic || galleryImageID) setGalleryRefreshKey((value) => value + 1);
      setAppModal({
        tone: 'success',
        title: isPublic ? '已开启公开' : '已设为不公开',
        message: isPublic ? '这张图片会在生成完成后出现在首页图库。' : '这张图片将仅自己可见，不会继续出现在首页。',
      });
    } catch (error) {
      setGenerationTasks((items) => items.map((candidate) => (candidate.id === task.id ? task : candidate)));
      setAppModal({ tone: 'error', title: '设置失败', message: getErrorMessage(error, '公开设置失败') });
    }
  };

  const handleLikeImage = async (item, liked) => {
    setFeedItems((items) => items.map((candidate) => (candidate.id === item.id ? { ...candidate, likedByMe: liked, likeCount: Math.max(0, (candidate.likeCount || candidate.likes || 0) + (liked ? 1 : -1)) } : candidate)));
    if (!authSession?.token) {
      setAuthOpen(true);
      return;
    }
    if (!String(item.id).startsWith('generated-')) {
      authPostJSON(`/api/v1/images/gallery/${item.id}/like`, authSession.token, { liked }, '点赞失败')
        .then((payload) => {
          if (payload?.item) {
            const nextItem = normalizeGalleryItem(payload.item);
            setFeedItems((items) => items.map((candidate) => (candidate.id === nextItem.id ? nextItem : candidate)));
            setSelectedImage((current) => (current?.id === nextItem.id ? nextItem : current));
          }
        })
        .catch((error) => setAppModal({ tone: 'error', title: '点赞失败', message: getErrorMessage(error, '点赞失败') }));
    }
  };

  const handleFeatureImage = async (item, next) => {
    setFeedItems((items) => items.map((candidate) => (candidate.id === item.id ? { ...candidate, ...next } : candidate)));
    setSelectedImage((current) => (current?.id === item.id ? { ...current, ...next } : current));
    if (authSession?.token && !String(item.id).startsWith('generated-')) {
      authPatchJSON(`/api/v1/images/gallery/${item.id}/featured`, authSession.token, next, '精选失败').catch(() => {});
    }
  };

  const handleFavoriteImage = async (item, favorited) => {
    setFeedItems((items) => items.map((candidate) => (candidate.id === item.id ? { ...candidate, favoritedByMe: favorited, favoriteCount: Math.max(0, (candidate.favoriteCount || 0) + (favorited ? 1 : -1)) } : candidate)));
    setSelectedImage((current) => (current?.id === item.id ? { ...current, favoritedByMe: favorited, favoriteCount: Math.max(0, (current.favoriteCount || 0) + (favorited ? 1 : -1)) } : current));
    if (!authSession?.token) {
      setAuthOpen(true);
      return;
    }
    if (!String(item.id).startsWith('generated-')) {
      authPostJSON(`/api/v1/images/gallery/${item.id}/favorite`, authSession.token, { favorited }, '收藏失败')
        .then((payload) => {
          if (payload?.item) {
            const nextItem = normalizeGalleryItem(payload.item);
            setFeedItems((items) => items.map((candidate) => (candidate.id === nextItem.id ? nextItem : candidate)));
            setSelectedImage((current) => (current?.id === nextItem.id ? nextItem : current));
          }
        })
        .catch((error) => setAppModal({ tone: 'error', title: '收藏失败', message: getErrorMessage(error, '收藏失败') }));
    }
  };

  return (
    <div className={`berserk-app${view === 'pricing' ? ' pricing-mode' : ''}`} data-theme={theme}>
      {view === 'pricing' ? (
        <PricingPage packages={packageItems} authSession={authSession} onAuthOpen={() => setAuthOpen(true)} onUserChange={handleSessionUser} onBack={() => setView('home')} />
      ) : (
        <>
          <TopBar currentUser={authSession?.user} theme={theme} onThemeChange={setTheme} onAuthOpen={() => setAuthOpen(true)} />
          <Sidebar currentUser={authSession?.user} currentView={view} pendingTaskCount={pendingTaskCount} onNavigate={setView} onProfileOpen={() => setProfileOpen(true)} onShareOpen={() => {
            if (!authSession?.token) setAuthOpen(true);
            else setShareOpen(true);
          }} onAuthOpen={() => setAuthOpen(true)} onLogout={handleLogout} onAppClick={(tool) => {
            if (tool === 'size-editor') setSizeEditorOpen(true);
            else if (tool === 'comic-studio') setComicStudioOpen(true);
            else setComingSoonOpen(true);
          }} />
          <main className="workspace">
            <MobileTopbar onHome={() => setView('home')} onMenuOpen={() => setMobileMenuOpen(true)} />
            {view === 'history' ? (
              <GenerationHistory tasks={generationTasks} currentUser={authSession?.user} onRefresh={loadGenerationTasks} onMessage={setAppModal} onVisibilityChange={handleTaskVisibilityChange} />
            ) : (
              <>
                {view === 'home' ? <KomikoComposer models={imageModels} feedItems={feedItems} activeQuery={galleryQuery} activeSort={gallerySort} onQueryChange={setGalleryQuery} onSortChange={setGallerySort} onGenerate={handleGenerateImage} /> : null}
                {feedError ? <p className="feed-error">{feedError}</p> : null}
                <MasonryFeed items={feedItems} loading={feedLoading} loadingMore={feedLoadingMore} hasMore={feedHasMore} onLoadMore={() => loadGalleryPage({ reset: false })} onOpen={setSelectedImage} onLike={handleLikeImage} onFeature={handleFeatureImage} onFavorite={handleFavoriteImage} />
              </>
            )}
          </main>
          {mobileMenuOpen ? (
            <MobileNavDrawer
              currentUser={authSession?.user}
              currentView={view}
              pendingTaskCount={pendingTaskCount}
              onClose={() => setMobileMenuOpen(false)}
              onNavigate={(nextView) => {
                setView(nextView);
                setMobileMenuOpen(false);
              }}
              onProfileOpen={() => {
                setProfileOpen(true);
                setMobileMenuOpen(false);
              }}
              onShareOpen={() => {
                setMobileMenuOpen(false);
                if (!authSession?.token) setAuthOpen(true);
                else setShareOpen(true);
              }}
              onAuthOpen={() => {
                setAuthOpen(true);
                setMobileMenuOpen(false);
              }}
              onLogout={() => {
                handleLogout();
                setMobileMenuOpen(false);
              }}
              onAppClick={(tool) => {
                setMobileMenuOpen(false);
                if (tool === 'size-editor') setSizeEditorOpen(true);
                else if (tool === 'comic-studio') setComicStudioOpen(true);
                else setComingSoonOpen(true);
              }}
            />
          ) : null}
        </>
      )}
      {selectedImage ? <ImagePreview item={selectedImage} models={imageModels} currentUser={authSession?.user} onClose={() => setSelectedImage(null)} onLike={handleLikeImage} onFavorite={handleFavoriteImage} onGenerate={handleGenerateImage} onMessage={setAppModal} /> : null}
      {shareOpen ? <ShareModal session={authSession} onClose={() => setShareOpen(false)} onAuthOpen={() => setAuthOpen(true)} /> : null}
      {profileOpen ? <ProfileModal session={authSession} onClose={() => setProfileOpen(false)} onAuthOpen={() => setAuthOpen(true)} onUserChange={handleSessionUser} onSessionChange={handleAuthSuccess} /> : null}
      {authOpen ? <AuthModal onClose={() => setAuthOpen(false)} onSuccess={handleAuthSuccess} /> : null}
      {sizeEditorOpen ? <SizeEditorModal onClose={() => setSizeEditorOpen(false)} /> : null}
      {comicStudioOpen ? <ComicStudioModal session={authSession} onAuthOpen={() => setAuthOpen(true)} onUserChange={handleSessionUser} onClose={() => setComicStudioOpen(false)} /> : null}
      {comingSoonOpen ? <AppModal title="即将上线" message="AI 应用模块正在打磨中，后续会接入更多创作工具。" onClose={() => setComingSoonOpen(false)} /> : null}
      {taskNotice ? <AppModal title="正在生成" message={taskNotice} onClose={() => setTaskNotice('')} /> : null}
      {appModal ? <AppModal {...appModal} onClose={() => setAppModal(null)} /> : null}
    </div>
  );
}

function TopBar({ currentUser, theme, onThemeChange, onAuthOpen }) {
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <PricingNoticeTicker />
      </div>
      <div className="topbar-actions">
        <div className="theme-menu-wrap">
          <button type="button" aria-label="切换明暗模式" onClick={() => setThemeMenuOpen((open) => !open)}>
            {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          {themeMenuOpen ? (
            <div className="theme-popover" role="menu">
              <button
                className={theme === 'light' ? 'active' : ''}
                type="button"
                onClick={() => {
                  onThemeChange('light');
                  setThemeMenuOpen(false);
                }}
              >
                <Sun size={15} /> 日间
              </button>
              <button
                className={theme === 'dark' ? 'active' : ''}
                type="button"
                onClick={() => {
                  onThemeChange('dark');
                  setThemeMenuOpen(false);
                }}
              >
                <Moon size={15} /> 夜间
              </button>
            </div>
          ) : null}
        </div>
        <button className="top-login" type="button" onClick={onAuthOpen}>
          {currentUser ? '已登录' : '登录'}
        </button>
      </div>
    </header>
  );
}

function PricingNoticeTicker() {
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setCycle((value) => value + 1), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="pricing-notice-ticker" aria-live="polite">
      <span key={cycle}>图片生成价格已降至 3 积分/张，历史成功出图差额积分将在登录或访问时自动补偿到账。</span>
    </div>
  );
}

function Sidebar({ currentUser, currentView, pendingTaskCount, onNavigate, onProfileOpen, onShareOpen, onAuthOpen, onLogout, onAppClick }) {
  return (
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="Neo AI" onClick={() => onNavigate('home')}>
        <img src="/assets/berserk-ai-icon.png" alt="" />
        <span>
          <strong>NEO AI</strong>
          <small>https://neo-ai.pw/</small>
        </span>
      </a>
      <nav className="side-nav" aria-label="主导航">
        {navItems.map(({ label, icon: Icon, view: itemView, badge }) => (
          <a
            className={currentView === itemView ? 'active' : ''}
            href={itemView === 'home' ? '#' : '#inspiration-feed'}
            key={label}
            onClick={(event) => {
              if (itemView === 'profile') {
                event.preventDefault();
                onProfileOpen();
                return;
              }
              event.preventDefault();
              onNavigate(itemView);
            }}
          >
            <Icon size={18} />
            <span>{label}</span>
            {itemView === 'history' && pendingTaskCount > 0 ? <em>{pendingTaskCount}</em> : badge ? <em>{badge}</em> : null}
          </a>
        ))}
      </nav>
      <div className="side-section">
        <button type="button">
          <span>AI 应用</span>
          <i />
          <em>正在筹备</em>
        </button>
        <nav className="side-nav side-subnav" aria-label="AI 应用">
          {aiAppItems.map(({ label, icon: Icon, tool }) => (
            <button type="button" key={label} onClick={() => onAppClick(tool)}>
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
      <div className="sidebar-spacer" />
      <section className="share-card">
        <button type="button" onClick={onShareOpen}>
          <span>
            <strong>分享 Neo AI</strong>
            <small>邀请注册得 10 积分</small>
          </span>
          <i>
            <Gift size={18} />
          </i>
        </button>
      </section>
      <section className="upgrade-card">
        <button type="button" onClick={() => onNavigate('pricing')}>
          <Sparkles size={18} /> 立即升级
        </button>
      </section>
      {currentUser ? (
        <div className="session-card">
          <span>{currentUser.email || '已登录'}</span>
          <strong className="session-credits">{Number(currentUser.credits || 0).toLocaleString('zh-CN')} 积分</strong>
          <button type="button" onClick={onLogout}>
            <LogOut size={16} /> 退出
          </button>
        </div>
      ) : (
        <button className="auth-entry" type="button" onClick={onAuthOpen}>
          登录
        </button>
      )}
      <div className="social-row">
        <a href="https://www.douyin.com/user/MS4wLjABAAAAPctRiYcwFwNx7JTqw55gxq20_jzroA_b48W1edHc7eI" target="_blank" rel="noreferrer" aria-label="Neo AI 抖音">
          <img src="/assets/douyin-icon.svg" alt="" />
        </a>
      </div>
    </aside>
  );
}

function MobileTopbar({ onHome, onMenuOpen }) {
  return (
    <header className="mobile-topbar">
      <a
        className="brand"
        href="#"
        aria-label="Neo AI"
        onClick={(event) => {
          event.preventDefault();
          onHome();
        }}
      >
        <img src="/assets/berserk-ai-icon.png" alt="" />
        <span>
          <strong>NEO AI</strong>
          <small>AI Image Studio</small>
        </span>
      </a>
      <button type="button" onClick={onMenuOpen} aria-label="打开菜单">
        <Menu size={21} />
      </button>
    </header>
  );
}

function MobileNavDrawer({ currentUser, currentView, pendingTaskCount, onClose, onNavigate, onProfileOpen, onShareOpen, onAuthOpen, onLogout, onAppClick }) {
  useEscape(onClose);

  return (
    <div className="mobile-nav-overlay" role="presentation" onClick={onClose}>
      <aside className="mobile-nav-drawer" role="dialog" aria-modal="true" aria-label="移动端导航" onClick={(event) => event.stopPropagation()}>
        <header>
          <a
            className="brand"
            href="#"
            aria-label="Neo AI"
            onClick={(event) => {
              event.preventDefault();
              onNavigate('home');
            }}
          >
            <img src="/assets/berserk-ai-icon.png" alt="" />
            <span>
              <strong>NEO AI</strong>
              <small>AI Image Studio</small>
            </span>
          </a>
          <button type="button" aria-label="关闭菜单" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <nav className="mobile-nav-list" aria-label="主导航">
          {navItems.map(({ label, icon: Icon, view: itemView }) => (
            <button
              className={currentView === itemView ? 'active' : ''}
              type="button"
              key={label}
              onClick={() => {
                if (itemView === 'profile') {
                  onProfileOpen();
                  return;
                }
                onNavigate(itemView);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {itemView === 'history' && pendingTaskCount > 0 ? <em>{pendingTaskCount}</em> : null}
            </button>
          ))}
        </nav>

        <section className="mobile-nav-section" aria-label="AI 应用">
          <strong>AI 应用</strong>
          <div className="mobile-app-grid">
            {aiAppItems.map(({ label, icon: Icon, tool }) => (
              <button type="button" key={label} onClick={() => onAppClick(tool)}>
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mobile-nav-actions">
          <button className="mobile-share-entry" type="button" onClick={onShareOpen}>
            <Gift size={18} /> 分享得积分
          </button>
          <button className="mobile-upgrade-entry" type="button" onClick={() => onNavigate('pricing')}>
            <Sparkles size={18} /> 立即升级
          </button>
          {currentUser ? (
            <div className="mobile-session-card">
              <span>{currentUser.email || '已登录'}</span>
              <strong>{Number(currentUser.credits || 0).toLocaleString('zh-CN')} 积分</strong>
              <button type="button" onClick={onLogout}>
                <LogOut size={16} /> 退出登录
              </button>
            </div>
          ) : (
            <button type="button" onClick={onAuthOpen}>
              <Mail size={18} /> 登录 / 注册
            </button>
          )}
        </section>
      </aside>
    </div>
  );
}

function KomikoComposer({ models, feedItems, activeQuery, activeSort, onQueryChange, onSortChange, onGenerate }) {
  const [expanded, setExpanded] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState('自动');
  const [selectedStyle, setSelectedStyle] = useState('');
  const [selectedModel, setSelectedModel] = useState(models[0]?.id || 'gpt-image');
  const [prompt, setPrompt] = useState('');
  const [referenceCount, setReferenceCount] = useState(0);
  const [styleOpen, setStyleOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const composerRef = useRef(null);
  const fileInputRef = useRef(null);
  const dynamicTags = useMemo(() => tagsFromImages(feedItems), [feedItems]);
  const sortLabel = activeSort === 'favorites' ? '收藏热门' : activeSort === 'likes' ? '点赞热门' : '热门';
  const applyQuery = (value) => {
    const normalized = value.trim();
    const query = normalized === '所有帖子' || normalized === activeQuery ? '' : normalized;
    onQueryChange(query);
    setSearchText(query);
    setSearchOpen(false);
  };

  useEffect(() => {
    if (!models.some((model) => model.id === selectedModel)) {
      setSelectedModel(models[0]?.id || 'gpt-image');
    }
  }, [models, selectedModel]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!expanded || styleOpen) return;
      if (composerRef.current && !composerRef.current.contains(event.target)) {
        setExpanded(false);
        setSizeOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [expanded, styleOpen]);

  return (
    <>
      <section className="komiko-composer">
        <form
          ref={composerRef}
          className={`prompt-bar${expanded ? ' expanded' : ''}`}
          onFocus={() => setExpanded(true)}
          onClick={() => setExpanded(true)}
          onSubmit={(event) => {
            event.preventDefault();
            const cleanPrompt = prompt.trim();
            if (!cleanPrompt) {
              setExpanded(true);
              return;
            }
            setIsGenerating(true);
            Promise.resolve(onGenerate({ prompt: cleanPrompt, style: selectedStyle, size: selectedSize, modelID: selectedModel }))
              .then(() => setPrompt(''))
              .catch((error) => window.alert(getErrorMessage(error, '生成失败')))
              .finally(() => setIsGenerating(false));
          }}
        >
          {expanded ? (
            <div className="composer-tabs" aria-label="生成类型">
              <button className="active" type="button">
                <ImageIcon size={21} /> 人工智能图像
              </button>
            </div>
          ) : null}
          <Search className="prompt-search-icon" size={22} />
          {expanded ? (
            <>
              <div className="composer-toolbar">
                {selectedStyle ? <span className="model-pill">{selectedStyle}</span> : null}
                <button className="style-pill" type="button" onClick={() => setStyleOpen(true)}>
                  <Palette size={15} /> 风格 <ChevronDown size={14} />
                </button>
              </div>
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} aria-label="图片提示词" placeholder="请用逗号分隔的短语输入提示信息。描述主体、风格、光影、构图和画面细节，系统会自动使用合适的生成配置。" />
              <div className="composer-options">
                <div className="size-picker">
                  <button type="button" onClick={() => setSizeOpen((open) => !open)}>
                    {selectedSize} <ChevronDown size={13} />
                  </button>
                  {sizeOpen ? (
                    <div className="size-popover">
                      {generationSizes.map((size) => (
                        <button
                          className={selectedSize === size ? 'active' : ''}
                          type="button"
                          key={size}
                          onClick={() => {
                            setSelectedSize(size);
                            setSizeOpen(false);
                          }}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button type="button" onClick={() => fileInputRef.current?.click()}>
                  <ImageIcon size={14} /> {referenceCount > 0 ? `参考 ${referenceCount}` : '参考'}
                </button>
                <input
                  ref={fileInputRef}
                  className="reference-input"
                  type="file"
                  accept="image/*"
                  multiple
                  webkitdirectory=""
                  directory=""
                  onChange={(event) => setReferenceCount(event.target.files?.length || 0)}
                />
              </div>
            </>
          ) : (
            <input value={prompt} onChange={(event) => setPrompt(event.target.value)} aria-label="图片提示词" placeholder="描述你想要生成的图片..." />
          )}
          <button type="submit" disabled={isGenerating}>
            {isGenerating ? '生成中' : '生成'} <Zap size={15} fill="currentColor" />
          </button>
          <img className="prompt-mascot" src="/assets/berserk-prompt-mascot-v2.png" alt="" />
        </form>
        <div className="filter-row" aria-label="筛选">
          <button type="button" onClick={() => setSearchOpen((open) => !open)}>
            <Search size={16} /> 搜索
          </button>
          <button className={activeSort === 'updated' ? 'selected' : ''} type="button" onClick={() => {
            onSortChange('updated');
            setSortOpen(false);
          }}>
            <RefreshCw size={16} /> 更新时间
          </button>
          <div className="filter-sort-wrap">
            <button className={activeSort === 'likes' || activeSort === 'favorites' ? 'selected' : ''} type="button" onClick={() => setSortOpen((open) => !open)}>
              <Flame size={16} /> {sortLabel} <ChevronDown size={15} />
            </button>
            {sortOpen ? (
              <div className="sort-popover" role="menu">
                <button
                  className={activeSort === 'likes' ? 'active' : ''}
                  type="button"
                  onClick={() => {
                    onSortChange('likes');
                    setSortOpen(false);
                  }}
                >
                  按点赞量排序
                </button>
                <button
                  className={activeSort === 'favorites' ? 'active' : ''}
                  type="button"
                  onClick={() => {
                    onSortChange('favorites');
                    setSortOpen(false);
                  }}
                >
                  按收藏量排序
                </button>
              </div>
            ) : null}
          </div>
          {dynamicTags.map((label, index) => (
            <button
              className={`${label === '精选' ? 'active-chip' : label === 'NeoAIConfession' ? 'featured-chip' : ''}${activeQuery === label || (!activeQuery && label === '所有帖子') ? ' selected' : ''}`}
              type="button"
              key={label}
              onClick={() => applyQuery(label)}
            >
              {label === '精选' ? <Star size={15} /> : index > 1 ? <Hash size={14} /> : null}
              {label}
            </button>
          ))}
        </div>
      </section>
      {searchOpen ? (
        <div className="search-card-overlay" onClick={() => setSearchOpen(false)}>
          <div className="filter-search-popover" onClick={(event) => event.stopPropagation()}>
            <Search size={24} />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyQuery(searchText);
              }}
              autoFocus
              placeholder="搜索帖子或生成记录"
            />
            <button type="button" aria-label="关闭搜索" onClick={() => setSearchOpen(false)}>
              <X size={20} />
            </button>
            <div className="search-card-tabs">
              <button className="active" type="button">帖子</button>
              <button type="button">生成记录</button>
            </div>
            <div className="search-card-grid">
              {feedItems.slice(0, 8).map((item) => (
                <img src={item.src} alt={item.title} key={item.id} />
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {styleOpen ? (
        <StyleModal
          selectedStyle={selectedStyle}
          onSelect={(styleName) => {
            setSelectedStyle(styleName);
            setStyleOpen(false);
          }}
          onClose={() => setStyleOpen(false)}
        />
      ) : null}
    </>
  );
}

function StyleModal({ selectedStyle, onSelect, onClose }) {
  const [activeCategory, setActiveCategory] = useState('art');
  const [favoriteStyles, setFavoriteStyles] = useState(() => readStyleFavorites());
  const visibleStyles =
    activeCategory === 'favorites'
      ? stylePresets.filter((style) => favoriteStyles.includes(style.name))
      : stylePresets.filter((style) => style.category === activeCategory || (activeCategory === 'general' && ['general', 'custom'].includes(style.category)));
  const activeCategoryLabel = styleCategories.find((category) => category.id === activeCategory)?.label || '艺术';

  useEscape(onClose);

  const toggleFavorite = (styleName) => {
    setFavoriteStyles((current) => {
      const next = current.includes(styleName) ? current.filter((name) => name !== styleName) : [...current, styleName];
      window.localStorage.setItem(STYLE_FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="style-overlay" role="dialog" aria-modal="true" aria-label="选择风格" onClick={onClose}>
      <div className="style-dialog" onClick={(event) => event.stopPropagation()}>
        <button className="style-close" type="button" aria-label="关闭风格选择" onClick={onClose}>
          <X size={18} />
        </button>
        <h2>选择风格</h2>
        <div className="style-layout">
          <aside className="style-sidebar">
            {styleCategories.map((category) => (
              <button className={activeCategory === category.id ? 'active' : ''} type="button" key={category.id} onClick={() => setActiveCategory(category.id)}>
                {category.id === 'favorites' ? <Star size={14} /> : null}
                {category.label}
              </button>
            ))}
          </aside>
          <section className="style-content">
            {activeCategory === 'favorites' && visibleStyles.length === 0 ? (
              <div className="style-favorites">
                <Star size={34} />
                <strong>还没有收藏</strong>
                <span>点击任意风格上的星标，可加入收藏方便快速访问</span>
              </div>
            ) : null}
            <h3>{activeCategoryLabel}</h3>
            <div className="style-grid">
              {visibleStyles.map((style) => (
                <button
                  className={selectedStyle === style.name ? 'selected' : ''}
                  type="button"
                  key={style.name}
                  onClick={() => onSelect(style.name)}
                >
                  <img src={style.image} alt={style.name} loading="lazy" />
                  <span>{style.name}</span>
                  <em className="style-badge">🌸</em>
                  <i
                    className={favoriteStyles.includes(style.name) ? 'favorited' : ''}
                    role="button"
                    tabIndex={0}
                    aria-label={favoriteStyles.includes(style.name) ? '取消收藏风格' : '收藏风格'}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleFavorite(style.name);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleFavorite(style.name);
                      }
                    }}
                  >
                    <Star size={18} fill={favoriteStyles.includes(style.name) ? 'currentColor' : 'none'} />
                  </i>
                  {selectedStyle === style.name ? <b>✓</b> : null}
                </button>
              ))}
            </div>
            {visibleStyles.length === 0 ? <p className="style-empty">当前分类暂无风格，先去其他分类看看。</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function MasonryFeed({ items, loading, loadingMore, hasMore, onLoadMore, onOpen, onLike, onFeature, onFavorite }) {
  const loaderRef = useRef(null);
  const columnCount = useMasonryColumnCount();
  const columns = useStableMasonryColumns(items, columnCount);

  useEffect(() => {
    if (!hasMore || !loaderRef.current) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: '420px 0px' },
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  if (loading) {
    return <GallerySkeleton />;
  }

  return (
    <section className="masonry-feed" id="inspiration-feed" aria-label="图片瀑布流">
      <div className="masonry-grid" style={{ '--masonry-columns': columnCount }}>
        {columns.map((column, columnIndex) => (
          <div className="masonry-column" key={`column-${columnIndex}`}>
            {column.map((item) => (
              <article className={`masonry-card${item.isFeatured || item.isPromptFeatured ? ' featured-card' : ''}`} key={item.id} onClick={() => onOpen(item)}>
                <MasonryImage item={item} />
                <span className="masonry-info">
                  <span className="masonry-author-line">
                    <img src={item.authorAvatarURL || '/assets/berserk-ai-icon.png'} alt="" />
                    <small>{item.author}</small>
                    <span className="masonry-stats" aria-label={`点赞 ${(item.likeCount ?? item.likes) || 0}`}>
                      <em>♡ {(item.likeCount ?? item.likes) || 0}</em>
                    </span>
                  </span>
                </span>
                <span className="masonry-favorite-count" aria-label={`收藏 ${item.favoriteCount || 0}`}>
                  <Star size={13} fill="none" /> {item.favoriteCount || 0}
                </span>
                <span className="card-actions" onClick={(event) => event.stopPropagation()}>
                  <button type="button" aria-label="点赞" onClick={() => onLike(item, !item.likedByMe)}>
                    {item.likedByMe ? '♥' : '♡'}
                  </button>
                  <button type="button" aria-label="收藏" onClick={() => onFavorite(item, !item.favoritedByMe)}>
                    <Star size={15} fill={item.favoritedByMe ? 'currentColor' : 'none'} />
                  </button>
                </span>
              </article>
            ))}
          </div>
        ))}
      </div>
      {hasMore ? (
        <button
          className="feed-loader"
          type="button"
          ref={loaderRef}
          onClick={onLoadMore}
          disabled={loadingMore}
        >
          {loadingMore ? '加载中' : '加载更多'} <RefreshCw size={16} />
        </button>
      ) : (
        <p className="feed-end" ref={loaderRef}>已经拉到底了</p>
      )}
    </section>
  );
}

function useMasonryColumnCount() {
  const getCount = () => {
    if (typeof window === 'undefined') return 4;
    if (window.innerWidth <= 760) return 2;
    if (window.innerWidth <= 1180) return 3;
    return 4;
  };
  const [columnCount, setColumnCount] = useState(getCount);

  useEffect(() => {
    const handleResize = () => setColumnCount(getCount());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return columnCount;
}

function useStableMasonryColumns(items, columnCount) {
  const layoutRef = useRef(null);
  return useMemo(() => {
    const count = Math.max(1, columnCount || 4);
    const ids = items.map((item) => item.id).filter(Boolean);
    const previous = layoutRef.current;
    const canAppend =
      previous &&
      previous.columnCount === count &&
      previous.ids.length <= ids.length &&
      previous.ids.every((id, index) => id === ids[index]);

    const layout = canAppend
      ? {
          columnCount: count,
          ids,
          columnIDs: previous.columnIDs.map((column) => [...column]),
          heights: [...previous.heights],
          assigned: new Map(previous.assigned),
        }
      : buildMasonryLayout(items, count);

    if (canAppend) {
      const itemByID = new Map(items.map((item) => [item.id, item]));
      ids.slice(previous.ids.length).forEach((id) => {
        const item = itemByID.get(id);
        if (!item || layout.assigned.has(id)) return;
        const target = shortestColumnIndex(layout.heights);
        layout.columnIDs[target].push(id);
        layout.assigned.set(id, target);
        layout.heights[target] += masonryItemWeight(item);
      });
    }

    layoutRef.current = layout;
    const itemByID = new Map(items.map((item) => [item.id, item]));
    return layout.columnIDs.map((column) => column.map((id) => itemByID.get(id)).filter(Boolean));
  }, [items, columnCount]);
}

function buildMasonryLayout(items, columnCount) {
  const count = Math.max(1, columnCount || 4);
  const columnIDs = Array.from({ length: count }, () => []);
  const heights = Array.from({ length: count }, () => 0);
  const assigned = new Map();
  const ids = [];
  items.forEach((item) => {
    if (!item?.id) return;
    const target = shortestColumnIndex(heights);
    ids.push(item.id);
    columnIDs[target].push(item.id);
    assigned.set(item.id, target);
    heights[target] += masonryItemWeight(item);
  });
  return { columnCount: count, ids, columnIDs, heights, assigned };
}

function shortestColumnIndex(heights) {
  let target = 0;
  for (let index = 1; index < heights.length; index += 1) {
    if (heights[index] < heights[target]) target = index;
  }
  return target;
}

function masonryItemWeight(item) {
  const width = Number(item?.width) || 1024;
  const height = Number(item?.height) || 1360;
  return height / Math.max(width, 1) + 0.24;
}

function MasonryImage({ item }) {
  const [loaded, setLoaded] = useState(false);
  const fallbackRatio = `${item.width || 1024} / ${item.height || 1360}`;
  const [ratio, setRatio] = useState(fallbackRatio);

  useEffect(() => {
    setLoaded(false);
    setRatio(fallbackRatio);
  }, [fallbackRatio, item.id, item.src]);

  return (
    <span className={`masonry-media${loaded ? ' loaded' : ''}`} style={{ aspectRatio: ratio }}>
      <img
        className="masonry-image"
        src={item.src}
        alt={`${item.author || 'Neo AI'} 的作品`}
        loading="lazy"
        decoding="async"
        onError={() => setLoaded(true)}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth > 0 && naturalHeight > 0) {
            setRatio(`${naturalWidth} / ${naturalHeight}`);
          }
          setLoaded(true);
        }}
        ref={(node) => {
          if (!node || loaded || !node.complete) return;
          const { naturalWidth, naturalHeight } = node;
          window.requestAnimationFrame(() => {
            if (naturalWidth > 0 && naturalHeight > 0) {
              setRatio(`${naturalWidth} / ${naturalHeight}`);
            }
            setLoaded(true);
          });
        }}
      />
    </span>
  );
}

function GallerySkeleton() {
  const ratios = ['0.72', '1', '0.66', '1.25', '0.78', '1', '0.62', '0.86', '1.18', '0.74', '1', '0.68'];
  return (
    <section className="masonry-feed loading" id="inspiration-feed" aria-label="图片瀑布流加载中" aria-busy="true">
      <div className="masonry-grid skeleton-grid">
        {ratios.map((ratio, index) => (
          <article className="masonry-card skeleton-card" key={`${ratio}-${index}`}>
            <span className="skeleton-image" style={{ aspectRatio: ratio }} />
            <span className="skeleton-author">
              <i />
              <b />
              <em />
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function GenerationHistory({ tasks, currentUser, onRefresh, onMessage, onVisibilityChange }) {
  const [previewTask, setPreviewTask] = useState(null);
  const canDownload = Number(currentUser?.totalRecharged || 0) > 0;
  const counts = {
    active: tasks.filter((task) => ['queued', 'running'].includes(task.status)).length,
    succeeded: tasks.filter((task) => task.status === 'succeeded').length,
    failed: tasks.filter((task) => task.status === 'failed').length,
  };
  return (
    <section className="generation-history">
      <header>
        <div>
          <h1>生成记录</h1>
          <p>新生成图片默认仅自己可见，开启公开后才会出现在首页图库。</p>
        </div>
        <button type="button" onClick={onRefresh}>
          <RefreshCw size={16} /> 刷新
        </button>
      </header>
      <div className="history-summary" aria-label="生成任务统计">
        <span>
          <i className="active" />
          <strong>{counts.active}</strong>
          <small>生成中</small>
        </span>
        <span>
          <i className="success" />
          <strong>{counts.succeeded}</strong>
          <small>已完成</small>
        </span>
        <span>
          <i className="failed" />
          <strong>{counts.failed}</strong>
          <small>失败</small>
        </span>
      </div>
      {tasks.length === 0 ? (
        <div className="history-empty">
          <Sparkles size={30} />
          <strong>暂无生成记录</strong>
          <span>提交一次生图任务后，进度会在这里展示。</span>
        </div>
      ) : (
        <div className="history-list">
          {tasks.map((task) => (
            <article className={`history-task ${task.status}`} key={task.id}>
              <div className={`history-thumb${task.resultImage ? '' : ' glass'}`}>
                {task.resultImage ? (
                  <button type="button" onClick={() => setPreviewTask(task)} aria-label="查看生成原图">
                    <img src={task.resultImage} alt="" />
                  </button>
                ) : (
                  <Sparkles size={24} />
                )}
              </div>
              <section className="history-body">
                <div className="history-title-row">
                  <strong>{historyStatusText(task.status)}</strong>
                  <div className="history-title-actions">
                    <button
                      className={`history-public-toggle${task.isPublic ? ' public' : ''}`}
                      type="button"
                      disabled={task.status === 'failed'}
                      title={task.isPublic ? '点击设为不公开' : '点击公开到首页'}
                      onClick={() => onVisibilityChange?.(task, !task.isPublic)}
                    >
                      {task.isPublic ? <Eye size={14} /> : <EyeOff size={14} />}
                      {task.isPublic ? '已公开' : '不公开'}
                    </button>
                    <span className={`history-status ${task.status}`}>{historyStatusText(task.status)}</span>
                  </div>
                </div>
                <p>{task.prompt}</p>
                {task.errorMessage ? <em>{historyErrorMessage(task.errorMessage)}</em> : null}
                {['queued', 'running'].includes(task.status) ? <b className="history-progress" /> : null}
                <div className="history-meta">
                  <span>{task.size || '自动'}</span>
                  <span>{task.creditsCost || 0} 积分</span>
                  <span>{relativeTime(task.createdAt)}</span>
                </div>
              </section>
            </article>
          ))}
        </div>
      )}
      {previewTask?.resultImage ? (
        <div className="history-preview-overlay" role="dialog" aria-modal="true" aria-label="生成图片预览" onClick={() => setPreviewTask(null)}>
          <div className="history-preview-actions" onClick={(event) => event.stopPropagation()}>
            {canDownload ? (
              <a href={previewTask.resultImage} download={`berserk-${previewTask.id || 'generated-image'}.png`} aria-label="下载生成原图">
                <Download size={18} /> 下载原图
              </a>
            ) : (
              <button
                type="button"
                aria-label="下载生成原图"
                onClick={() => {
                  setPreviewTask(null);
                  onMessage?.({ tone: 'warning', title: '暂不能下载', message: currentUser ? '购买过积分后即可下载原图。' : '请先登录并购买积分后再下载原图。' });
                }}
              >
                <Download size={18} /> 下载原图
              </button>
            )}
            <button type="button" aria-label="关闭预览" onClick={() => setPreviewTask(null)}>
              <X size={20} />
            </button>
          </div>
          <img src={previewTask.resultImage} alt="" onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
    </section>
  );
}

function historyStatusText(status) {
  const statusText = {
    queued: '排队中',
    running: '生成中',
    succeeded: '已完成',
    failed: '失败',
  };
  return statusText[status] || '未知状态';
}

function historyErrorMessage(message) {
  const text = String(message || '').trim();
  if (!text) return '';
  return localizeError(text, '生成失败，请稍后重试');
}

function ImagePreview({ item, models, currentUser, onClose, onLike, onFavorite, onGenerate, onMessage }) {
  const [panelMode, setPanelMode] = useState('detail');
  const [useReference, setUseReference] = useState(false);
  const canDownload = Number(currentUser?.totalRecharged || 0) > 0;
  useEscape(onClose);

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true" aria-label={`${item.title} 预览`} onClick={onClose}>
      <div className="preview-floating-actions" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={() => onFavorite(item, !item.favoritedByMe)}>
          <Star size={16} fill={item.favoritedByMe ? 'currentColor' : 'none'} /> 收藏
        </button>
        {canDownload ? (
          <a href={item.fullSrc || item.src} download aria-label="下载图片">
            <Download size={18} />
          </a>
        ) : (
          <button
            type="button"
            aria-label="下载图片"
            onClick={() => onMessage?.({ tone: 'warning', title: '暂不能下载', message: currentUser ? '购买过积分后即可下载原图。' : '请先登录并购买积分后再下载原图。' })}
          >
            <Download size={18} />
          </button>
        )}
        <button type="button" aria-label="关闭预览" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="preview-shell" onClick={(event) => event.stopPropagation()}>
        <div className="preview-stage">
          <img src={item.fullSrc || item.src} alt={item.title} />
        </div>
        <aside className="preview-panel">
          {panelMode === 'generate' ? (
            <PreviewGeneratePanel
              item={item}
              models={models}
              useReference={useReference}
              onBack={() => setPanelMode('detail')}
              onGenerate={onGenerate}
            />
          ) : (
            <>
              <div className="preview-author">
                <img src={item.authorAvatarURL || '/assets/berserk-ai-icon.png'} alt="" />
                <span>
                  <strong>{item.author}</strong>
                  <small>@{String(item.author || 'NeoAI').replace(/\s+/g, '')}</small>
                </span>
              </div>
              <div className="preview-stats">
                <button type="button" onClick={() => onLike(item, !item.likedByMe)}>{item.likedByMe ? '♥' : '♡'} {item.likeCount ?? item.likes}</button>
                <span><BarChart3 size={16} /> {formatViews((item.likeCount || item.likes || 0) * 21 + 420)}</span>
                <span>{relativeTime(item.createdAt)}</span>
              </div>
              <div className={`preview-prompt${item.isPromptFeatured ? ' prompt-featured' : ''}`}>
                <p>{item.promptZh}</p>
              </div>
              <div className="preview-tools">
                <button type="button" onClick={() => navigator.clipboard?.writeText(item.promptZh || '')}><Copy size={16} /> 复制</button>
              </div>
              <div className="preview-bottom-actions">
                <button className="preview-action" type="button" onClick={() => {
                  setUseReference(false);
                  setPanelMode('generate');
                }}>
                  <Sparkles size={18} /> 使用提示词
                </button>
                <button className="preview-action" type="button" onClick={() => {
                  setUseReference(true);
                  setPanelMode('generate');
                }}>
                  <ImageIcon size={18} /> 用作参考图
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function PreviewGeneratePanel({ item, models, useReference, onBack, onGenerate }) {
  const [promptText, setPromptText] = useState(item.promptZh || '');
  const [selectedModel, setSelectedModel] = useState(item.modelID || models[0]?.id || 'gpt-image');
  const [selectedSize, setSelectedSize] = useState('自动');
  const [quality, setQuality] = useState('standard');
  const [quantity, setQuantity] = useState(1);
  const [resolution2K, setResolution2K] = useState(false);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const [negativePrompt, setNegativePrompt] = useState('');
  const [localRefs, setLocalRefs] = useState([]);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);
  const creditCost = IMAGE_CREDIT_COST * quantity;
  const referenceImages = [
    ...(useReference ? [{ src: item.fullSrc || item.src, preview: item.src }] : []),
    ...localRefs,
  ].slice(0, 5);

  useEffect(() => {
    if (!models.some((model) => model.id === selectedModel)) {
      setSelectedModel(models[0]?.id || 'gpt-image');
    }
  }, [models, selectedModel]);

  const submit = () => {
    const cleanPrompt = promptText.trim();
    if (!cleanPrompt) return;
    setBusy(true);
    Promise.resolve(onGenerate({
      prompt: cleanPrompt,
      style: '',
      size: selectedSize,
      modelID: selectedModel,
      images: referenceImages.map((image) => image.src),
      quality,
      n: quantity,
      negativePrompt,
      resolution: resolution2K ? '2k' : 'auto',
    }))
      .catch((error) => window.alert(getErrorMessage(error, '生成失败')))
      .finally(() => setBusy(false));
  };

  const improvePrompt = () => {
    setPromptText((value) => {
      const clean = value.trim();
      if (!clean) return clean;
      if (clean.includes('高质量细节')) return clean;
      return `${clean}\n\n高质量细节，清晰主体，商业级构图，精致光影，画面干净。`;
    });
  };

  const desaturatePrompt = () => {
    setPromptText((value) => {
      const clean = value.trim();
      if (!clean) return clean;
      if (clean.includes('低饱和')) return clean;
      return `${clean}\n\n低饱和配色，柔和色阶，避免过度鲜艳。`;
    });
  };

  const handleReferenceFiles = (event) => {
    const files = Array.from(event.target.files || []).slice(0, Math.max(0, 5 - referenceImages.length));
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setLocalRefs((items) => [...items, { src: reader.result, preview: reader.result }].slice(0, 5));
        }
      };
      reader.readAsDataURL(file);
    });
    event.target.value = '';
  };

  return (
    <div className="preview-generate-panel">
      <header>
        <strong>生成</strong>
        <button type="button" aria-label="返回详情" onClick={onBack}>
          <LayoutTemplate size={17} />
        </button>
      </header>
      <div className="reference-strip">
        <span><ImageIcon size={15} /> {referenceImages.length}/5</span>
        {referenceImages[0] ? <img src={referenceImages[0].preview} alt="" /> : null}
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={referenceImages.length >= 5}>
          <Plus size={20} />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleReferenceFiles} />
      </div>
      <label className="generate-prompt-box">
        <span>
          画面描述 <em>使用</em> <b>引用参考图</b>
          <button type="button" aria-label="复制提示词" onClick={() => navigator.clipboard?.writeText(promptText)}>
            <Copy size={14} />
          </button>
        </span>
        <textarea value={promptText} onChange={(event) => setPromptText(event.target.value)} />
        <div>
          <button type="button" onClick={improvePrompt}>AI 帮改</button>
          <button type="button" onClick={desaturatePrompt}>消色</button>
          <button type="button" onClick={submit}>⌘ + ↵</button>
        </div>
      </label>
      <div className="generate-setting-row">
        <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
        <button type="button" onClick={() => setQuantity((value) => (value >= 4 ? 1 : value + 1))}>{quantity}/4</button>
        <div className="size-select">
          <button type="button" onClick={() => setSizeMenuOpen((value) => !value)}><LayoutTemplate size={14} /> {selectedSize}</button>
          {sizeMenuOpen ? (
            <div className="size-menu">
              {generationSizes.map((size) => (
                <button
                  className={selectedSize === size ? 'active' : ''}
                  type="button"
                  key={size}
                  onClick={() => {
                    setSelectedSize(size);
                    setSizeMenuOpen(false);
                  }}
                >
                  {size}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button type="button" className={resolution2K ? 'active' : ''} onClick={() => setResolution2K((value) => !value)}>2K</button>
      </div>
      <div className="quality-group" aria-label="选择生成质量">
        {[
          ['standard', '标准'],
          ['medium', 'Medium'],
          ['high', 'High'],
        ].map(([value, label]) => (
          <button className={quality === value ? 'active' : ''} type="button" key={value} onClick={() => setQuality(value)}>
            {label}
          </button>
        ))}
      </div>
      <button className="generate-submit" type="button" onClick={submit} disabled={busy || !promptText.trim()}>
        {busy ? '生成中' : `生成图片 ✨ ${creditCost}`}
      </button>
    </div>
  );
}

function ComicStudioModal({ session, onAuthOpen, onUserChange, onClose }) {
  const [works, setWorks] = useState(comicWorksSeed);
  const [comicView, setComicView] = useState('works');
  const [selectedWorkID, setSelectedWorkID] = useState('');
  const [selectedEpisodeID, setSelectedEpisodeID] = useState('');
  const [selectedComicPageID, setSelectedComicPageID] = useState('');
  const [scriptBeats, setScriptBeats] = useState(comicScriptBeats);
  const [panels, setPanels] = useState(comicPanelsSeed);
  const [assets, setAssets] = useState(comicAssetsSeed);
  const [queue, setQueue] = useState(comicQueueSeed);
  const [assetTab, setAssetTab] = useState('人物');
  const [selectedPanelID, setSelectedPanelID] = useState('');
  const [selectedBeatID, setSelectedBeatID] = useState('');
  const [selectedAssetID, setSelectedAssetID] = useState('');
  const [zoom, setZoom] = useState(88);
  const [autoLayout, setAutoLayout] = useState(true);
  const [pageSize, setPageSize] = useState('A4 竖版');
  const [panelTemplate, setPanelTemplate] = useState('经典 6 格');
  const [activeTool, setActiveTool] = useState('组装页面');
  const [scriptTab, setScriptTab] = useState('故事线');
  const [assetQuery, setAssetQuery] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [novelDraft, setNovelDraft] = useState('');
  const [bubbleShape, setBubbleShape] = useState('圆角气泡');
  const [letteringStyle, setLetteringStyle] = useState('黑体对白');
  const [pageTone, setPageTone] = useState('黑白高反差');
  const [showPanelGuides, setShowPanelGuides] = useState(true);
  const [autoSaveDraft, setAutoSaveDraft] = useState(true);
  const [matureFilter, setMatureFilter] = useState(true);
  const [comicLoading, setComicLoading] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef(0);

  useEscape(onClose);

  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  useEffect(() => {
    if (!session?.token) {
      setComicLoading(false);
      setWorks([]);
      setAssets([]);
      setScriptBeats([]);
      setPanels([]);
      setQueue([]);
      setSelectedWorkID('');
      setSelectedEpisodeID('');
      setSelectedComicPageID('');
      setSelectedPanelID('');
      setSelectedBeatID('');
      setSelectedAssetID('');
      return;
    }
    let cancelled = false;
    setComicLoading(true);
    getJSON('/api/v1/manga/works', session.token)
      .then((payload) => {
        if (cancelled) return;
        const remoteWorks = (payload?.items || []).map(normalizeComicWork);
        const remoteAssets = (payload?.assets || []).map(normalizeComicAsset);
        setWorks(remoteWorks);
        setAssets(remoteAssets);
        if (remoteWorks.length > 0) {
          const firstWork = remoteWorks[0];
          const firstEpisode = firstWork.episodes[0];
          const firstPage = firstEpisode?.pages[0];
          setSelectedWorkID(firstWork.id);
          setSelectedEpisodeID(firstEpisode?.id || '');
          setSelectedComicPageID(firstPage?.id || '');
          setScriptBeats(firstPage?.scriptBeats || []);
          setPanels(firstPage?.panels || []);
          setSelectedBeatID(firstPage?.scriptBeats?.[0]?.id || '');
          setSelectedPanelID(firstPage?.panels?.[0]?.id || '');
        } else {
          setSelectedWorkID('');
          setSelectedEpisodeID('');
          setSelectedComicPageID('');
          setScriptBeats([]);
          setPanels([]);
          setSelectedBeatID('');
          setSelectedPanelID('');
        }
        setSelectedAssetID(remoteAssets[0]?.id || '');
      })
      .catch((error) => showToast(getErrorMessage(error, '漫画数据加载失败')))
      .finally(() => {
        if (!cancelled) setComicLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.token]);

  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 1900);
  };

  const selectedPanel = panels.find((panel) => panel.id === selectedPanelID) || panels[0] || emptyComicPanel;
  const selectedBeat = scriptBeats.find((beat) => beat.id === selectedBeatID) || scriptBeats[0] || emptyComicBeat;
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetID) || assets[0] || null;
  const visibleAssets = assets.filter((asset) => {
    const tabMatched = assetTab === '收藏' ? asset.favorite : asset.type === assetTab;
    const query = assetQuery.trim().toLowerCase();
    if (!tabMatched) return false;
    if (!query) return true;
    return `${asset.title} ${asset.prompt || ''}`.toLowerCase().includes(query);
  });
  const selectedWork = works.find((work) => work.id === selectedWorkID) || works[0];
  const selectedEpisode = selectedWork?.episodes.find((episode) => episode.id === selectedEpisodeID) || selectedWork?.episodes[0];
  const selectedComicPage = selectedEpisode?.pages.find((page) => page.id === selectedComicPageID) || selectedEpisode?.pages[0];
  const scriptSourceText = scriptBeats.map((beat) => `${beat.title}。${beat.summary}${beat.dialogue ? `“${beat.dialogue}”` : ''}`).join('\n');

  const requireComicAuth = () => {
    if (session?.token) return true;
    showToast('请先登录后使用 AI 漫画功能');
    onAuthOpen?.();
    return false;
  };

  const replaceWork = (nextWork) => {
    const normalized = normalizeComicWork(nextWork);
    setWorks((items) => items.map((work) => (work.id === normalized.id ? normalized : work)));
    return normalized;
  };

  const replacePageInWorks = (nextPage) => {
    const normalized = normalizeComicPage(nextPage);
    setWorks((items) => items.map((work) => ({
      ...work,
      episodes: work.episodes.map((episode) => ({
        ...episode,
        pages: episode.pages.map((page) => (page.id === normalized.id ? { ...page, ...normalized } : page)),
      })),
    })));
    return normalized;
  };

  const applyPageState = (page) => {
    if (!page) return;
    const normalized = normalizeComicPage(page);
    setSelectedComicPageID(normalized.id);
    setScriptBeats(normalized.scriptBeats || []);
    setPanels(normalized.panels || []);
    setSelectedBeatID(normalized.scriptBeats?.[0]?.id || '');
    setSelectedPanelID(normalized.panels?.[0]?.id || '');
  };

  const runComicAction = async (key, action) => {
    if (busyAction) return null;
    setBusyAction(key);
    try {
      return await action();
    } catch (error) {
      showToast(getErrorMessage(error, '操作失败'));
      return null;
    } finally {
      setBusyAction('');
    }
  };

  const selectBeat = (beatID) => {
    setSelectedBeatID(beatID);
    const matchingPanel = panels.find((panel) => panel.beatID === beatID);
    if (matchingPanel) setSelectedPanelID(matchingPanel.id);
  };

  const selectPanel = (panelID) => {
    setSelectedPanelID(panelID);
    const panel = panels.find((item) => item.id === panelID);
    if (panel?.beatID) setSelectedBeatID(panel.beatID);
  };

  const toggleFavoriteAsset = (assetID) => {
    const current = assets.find((asset) => asset.id === assetID);
    if (!current) return;
    setAssets((items) => items.map((asset) => (asset.id === assetID ? { ...asset, favorite: !asset.favorite } : asset)));
    if (!session?.token || !isBackendID(assetID)) return;
    authPostJSON(`/api/v1/studio/assets/${assetID}/favorite`, session.token, { favorite: !current.favorite }, '收藏资产失败')
      .then((payload) => {
        if (payload?.asset) {
          const nextAsset = normalizeComicAsset(payload.asset);
          setAssets((items) => items.map((asset) => (asset.id === nextAsset.id ? nextAsset : asset)));
        }
      })
      .catch((error) => showToast(getErrorMessage(error, '收藏资产失败')));
  };

  const applyAssetToPanel = (asset = selectedAsset) => {
    if (!asset) return;
    setPanels((items) => items.map((panel) => (panel.id === selectedPanelID ? { ...panel, src: asset.src } : panel)));
    showToast(`${asset.title} 已替换到当前画格`);
  };

  const regeneratePanel = () => {
    if (!requireComicAuth()) return;
    const nextTask = {
      id: `queue-${Date.now()}`,
      title: `${selectedComicPage?.title || '当前页面'} · ${selectedBeat.title.replace(/^第\s*/, '')}`,
      subtitle: selectedBeat.summary,
      progress: 8,
      status: '生成中',
      src: selectedPanel.src,
    };
    setQueue((items) => [nextTask, ...items].slice(0, 4));
    runComicAction('generate-panel', async () => {
      const payload = await authPostJSON('/api/v1/manga/generate', session.token, {
        workID: selectedWork?.id,
        pageID: selectedComicPage?.id,
        panelID: selectedPanel?.id,
        prompt: `${selectedBeat.summary}${selectedBeat.dialogue ? `，对白：${selectedBeat.dialogue}` : ''}`,
        title: selectedBeat.title,
        type: '画格',
        size: pageSize === 'Webtoon 长条' ? '1024x1792' : '1024x1360',
        quality: 'medium',
        n: 1,
        images: selectedAsset?.src ? [selectedAsset.src] : [],
        applyToPage: true,
      }, '生成画格失败');
      if (payload?.user) onUserChange?.(payload.user);
      const image = payload?.images?.[0];
      if (image?.url) {
        const nextSrc = image.thumbnailURL || image.url;
        setPanels((items) => items.map((panel) => (panel.id === selectedPanelID ? { ...panel, src: nextSrc } : panel)));
        setQueue((items) => items.map((item) => (item.id === nextTask.id ? { ...item, src: nextSrc, status: '已完成', progress: 100 } : item)));
      }
      if (payload?.page) replacePageInWorks(payload.page);
      if (payload?.work) replaceWork(payload.work);
      showToast(`画格已生成，扣除 ${payload?.credits || 3} 积分`);
    });
  };

  const updatePanelCaption = (value) => {
    setPanels((items) => items.map((panel) => (panel.id === selectedPanelID ? { ...panel, caption: value } : panel)));
  };

  const addPage = () => {
    if (!requireComicAuth()) return;
    if (!isBackendID(selectedEpisode?.id)) {
      showToast('请先选择真实章节');
      return;
    }
    runComicAction('add-page', async () => {
      const title = `第 ${(selectedEpisode?.pages.length || 0) + 1} 页`;
      const payload = await authPostJSON(`/api/v1/manga/episodes/${selectedEpisode.id}/pages`, session.token, { title, thumb: '' }, '新增页面失败');
      if (payload?.page) {
        const remotePage = normalizeComicPage(payload.page);
        setWorks((items) => items.map((work) => (
          work.id !== selectedWorkID
            ? work
            : { ...work, episodes: work.episodes.map((episode) => (episode.id === selectedEpisodeID ? { ...episode, pages: [...episode.pages, remotePage] } : episode)) }
        )));
        setSelectedComicPageID(remotePage.id);
        setScriptBeats([]);
        setPanels([]);
        setSelectedBeatID('');
        setSelectedPanelID('');
        showToast('已新增空白漫画页');
      }
    });
  };

  const parseAgain = () => {
    if (!requireComicAuth()) return;
    runComicAction('parse-script', async () => {
      const payload = await authPostJSON('/api/v1/manga/script', session.token, {
        workID: selectedWork?.id,
        episodeID: selectedEpisode?.id,
        pageID: selectedComicPage?.id,
        text: scriptSourceText || selectedEpisode?.summary || selectedWork?.title || novelDraft,
      }, '拆书失败');
      if (payload?.beats?.length) setScriptBeats(payload.beats);
      if (payload?.assets?.length) {
        const incoming = payload.assets.map(normalizeComicAsset);
        setAssets((items) => mergeComicAssets(items, incoming));
      }
      if (payload?.page) replacePageInWorks(payload.page);
      if (payload?.work) replaceWork(payload.work);
      if (payload?.user) onUserChange?.(payload.user);
      showToast(`拆书完成，扣除 ${payload?.credits || 3} 积分`);
    });
  };

  const openWork = (workID) => {
    const nextWork = works.find((work) => work.id === workID);
    if (!nextWork) return;
    const nextEpisode = nextWork.episodes[0];
    setSelectedWorkID(nextWork.id);
    setSelectedEpisodeID(nextEpisode?.id || '');
    setSelectedComicPageID(nextEpisode?.pages[0]?.id || '');
    setComicView('episodes');
  };

  const openEpisode = (episodeID) => {
    const nextEpisode = selectedWork?.episodes.find((episode) => episode.id === episodeID);
    if (!nextEpisode) return;
    setSelectedEpisodeID(nextEpisode.id);
    setSelectedComicPageID(nextEpisode.pages[0]?.id || '');
    setComicView('pages');
  };

  const openPage = (pageID) => {
    const page = selectedEpisode?.pages.find((item) => item.id === pageID);
    applyPageState(page);
    setComicView('editor');
  };

  const addEpisode = () => {
    if (!requireComicAuth()) return;
    if (!isBackendID(selectedWork?.id)) {
      showToast('请先选择真实作品');
      return;
    }
    runComicAction('add-episode', async () => {
      const title = `第 ${(selectedWork?.episodes.length || 0) + 1} 话 · 新章节`;
      const summary = '从小说文本拆解新一话的角色、场景、道具和页面。';
      const payload = await authPostJSON(`/api/v1/manga/works/${selectedWork.id}/episodes`, session.token, { title, summary }, '新增一话失败');
      if (payload?.episode) {
        const remoteEpisode = normalizeComicEpisode(payload.episode);
        setWorks((items) => items.map((work) => (work.id === selectedWorkID ? { ...work, episodes: [...work.episodes, remoteEpisode] } : work)));
        setSelectedEpisodeID(remoteEpisode.id);
        setSelectedComicPageID(remoteEpisode.pages[0]?.id || '');
        setScriptBeats(remoteEpisode.pages[0]?.scriptBeats || []);
        setPanels(remoteEpisode.pages[0]?.panels || []);
        setComicView('pages');
        showToast('已新增一话');
      }
    });
  };

  const createWork = () => {
    if (!requireComicAuth()) return;
    runComicAction('create-work', async () => {
      const payload = await authPostJSON('/api/v1/manga/works', session.token, { title: '新漫画作品', subtitle: '未分类 / 草稿', cover: '' }, '创建作品失败');
      if (payload?.work) {
        const remoteWork = normalizeComicWork(payload.work);
        setWorks((items) => [remoteWork, ...items]);
        setSelectedWorkID(remoteWork.id);
        setSelectedEpisodeID(remoteWork.episodes[0]?.id || '');
        setSelectedComicPageID(remoteWork.episodes[0]?.pages[0]?.id || '');
        setScriptBeats(remoteWork.episodes[0]?.pages[0]?.scriptBeats || []);
        setPanels(remoteWork.episodes[0]?.pages[0]?.panels || []);
        setComicView('episodes');
        showToast('已创建新作品');
      }
    });
  };

  const saveCurrentPage = () => {
    if (!session?.token || !isBackendID(selectedComicPage?.id)) {
      showToast('请先创建真实漫画页面');
      if (!session?.token) onAuthOpen?.();
      return;
    }
    runComicAction('save-page', async () => {
      const payload = await authPatchJSON(`/api/v1/manga/pages/${selectedComicPage.id}`, session.token, {
        title: selectedComicPage.title,
        thumb: selectedPanel?.src || selectedComicPage.thumb,
        status: '已保存',
        scriptBeats,
        panels,
      }, '保存草稿失败');
      if (payload?.page) replacePageInWorks(payload.page);
      showToast('草稿已保存');
    });
  };

  const duplicateCurrentPage = (pageID = selectedComicPageID) => {
    const sourceEpisode = selectedWork?.episodes.find((episode) => episode.pages.some((page) => page.id === pageID));
    if (!sourceEpisode || !isBackendID(pageID)) return;
    if (!requireComicAuth()) return;
    runComicAction('duplicate-page', async () => {
      const payload = await authPostJSON(`/api/v1/manga/pages/${pageID}/duplicate`, session.token, {}, '复制页面失败');
      if (payload?.page) {
        const remotePage = normalizeComicPage(payload.page);
        setWorks((items) => items.map((work) => (work.id === selectedWorkID ? { ...work, episodes: work.episodes.map((episode) => (episode.id === sourceEpisode.id ? { ...episode, pages: [...episode.pages, remotePage] } : episode)) } : work)));
        showToast('页面已复制');
      }
    });
  };

  const generateSelectedAsset = (replacePanel = false) => {
    if (!selectedAsset || !requireComicAuth()) return;
    runComicAction('generate-asset', async () => {
      const assetIsRemote = isBackendID(selectedAsset.id);
      const payload = await authPostJSON(assetIsRemote ? `/api/v1/studio/assets/${selectedAsset.id}/generate` : '/api/v1/manga/generate', session.token, {
        workID: selectedWork?.id,
        assetID: assetIsRemote ? selectedAsset.id : '',
        type: selectedAsset.type,
        title: selectedAsset.title,
        prompt: selectedAsset.prompt || `${selectedAsset.title}，${selectedAsset.type}，黑白漫画资产，统一角色设定，高质量细节`,
        size: '1024x1024',
        quality: 'medium',
        n: 1,
      }, '生成资产失败');
      if (payload?.user) onUserChange?.(payload.user);
      if (payload?.asset) {
        const nextAsset = normalizeComicAsset(payload.asset);
        setAssets((items) => items.map((asset) => (asset.id === nextAsset.id ? nextAsset : asset)));
        setSelectedAssetID(nextAsset.id);
        if (replacePanel) applyAssetToPanel(nextAsset);
      } else if (payload?.images?.[0]?.url && replacePanel) {
        applyAssetToPanel({ ...selectedAsset, src: payload.images[0].thumbnailURL || payload.images[0].url });
      }
      showToast(`资产已生成，扣除 ${payload?.credits || 3} 积分`);
    });
  };

  const exportComicPage = () => {
    const html = `<!doctype html><meta charset="utf-8"><title>${selectedComicPage?.title || 'comic-page'}</title><style>body{margin:0;background:#111;display:grid;place-items:center;min-height:100vh}.page{width:720px;background:#fff;padding:18px;display:grid;grid-template-columns:1fr 1fr;gap:8px}.frame{position:relative;overflow:hidden;background:#000}.wide{grid-column:span 2}.frame img{width:100%;height:100%;object-fit:cover;display:block}.bubble{position:absolute;left:12px;top:12px;max-width:60%;background:#fff;border:2px solid #111;border-radius:12px;padding:8px;font:700 14px sans-serif}</style><main class="page">${panels.map((panel) => `<section class="frame ${panel.layout === 'wide' ? 'wide' : ''}"><img src="${panel.src || ''}" alt="">${panel.caption ? `<span class="bubble">${panel.caption}</span>` : ''}</section>`).join('')}</main>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${selectedWork?.title || 'neo-ai-comic'}-${selectedComicPage?.title || 'page'}.html`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('漫画页已导出为 HTML，可用于预览或转 PDF');
  };

  const addScriptBeat = () => {
    const nextBeat = {
      id: `beat-${Date.now()}`,
      title: `第 ${scriptBeats.length + 1} 格  新分镜`,
      shot: '中景',
      summary: '补充这一格的画面动作、人物位置和镜头信息。',
      dialogue: '',
      assets: [],
    };
    setScriptBeats((items) => [...items, nextBeat]);
    setSelectedBeatID(nextBeat.id);
    showToast('已添加一个待编辑分镜');
  };

  const toolItems = [
    ['拆解脚本', WandSparkles],
    ['资产库', ImageIcon],
    ['组装页面', PanelsTopLeft],
    ['对白气泡', MessageCircle],
    ['样式/字体', Type],
    ['我的收藏', Star],
    ['设置', Settings],
  ];
  const favoriteAssets = assets.filter((asset) => asset.favorite);
  const selectedPanelIndex = Math.max(0, panels.findIndex((panel) => panel.id === selectedPanelID));
  const renderComicPreview = (src, label = '暂无图片') => (
    src ? <img src={src} alt="" /> : (
      <span className="comic-image-placeholder">
        <ImageIcon size={22} />
        <small>{label}</small>
      </span>
    )
  );

  const renderScriptPanel = () => (
    <aside className="comic-script-panel">
      <div className="comic-panel-heading">
        <strong>分镜脚本</strong>
        <button type="button" onClick={parseAgain} disabled={busyAction === 'parse-script'}>
          {busyAction === 'parse-script' ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />} 重新解析
        </button>
      </div>
      <div className="comic-script-tabs">
        {['故事线', '全文预览'].map((tab) => (
          <button className={scriptTab === tab ? 'active' : ''} type="button" key={tab} onClick={() => setScriptTab(tab)}>{tab}</button>
        ))}
      </div>
      <div className="comic-beat-list">
        {scriptTab === '故事线' && scriptBeats.length === 0 ? (
          <p className="comic-empty-state">还没有真实分镜。粘贴小说文本并点击拆书后，这里会显示后端生成的分镜。</p>
        ) : scriptTab === '故事线' ? scriptBeats.map((beat) => (
          <button className={beat.id === selectedBeatID ? 'active' : ''} type="button" key={beat.id} onClick={() => selectBeat(beat.id)}>
            <span>
              <strong>{beat.title}</strong>
              <em>景别：{beat.shot}</em>
            </span>
            <small>{beat.summary}</small>
            {beat.dialogue ? <i>对白：{beat.dialogue}</i> : <i>动作：无对白画面</i>}
            <b>参考资产：{beat.assets.join('、')}</b>
          </button>
        )) : (
          <article className="comic-script-preview">
            <strong>{selectedEpisode?.title || '当前章节'}</strong>
            <p>{scriptSourceText || '还没有真实分镜内容。'}</p>
          </article>
        )}
      </div>
      <button className="comic-add-beat" type="button" onClick={addScriptBeat}>
        <Plus size={16} /> 新增分镜
      </button>
    </aside>
  );

  const renderCanvas = () => (
    <main className="comic-canvas-zone">
      <div className="comic-floating-tools" aria-label="画布工具">
        {[Move, MousePointer2, ImagePlus, Type, MessageCircle].map((Icon, index) => (
          <button className={index === 1 ? 'active' : ''} type="button" key={String(index)} onClick={() => {
            if (index === 2) setActiveTool('资产库');
            if (index === 3 || index === 4) setActiveTool('对白气泡');
          }}>
            <Icon size={18} />
          </button>
        ))}
      </div>
      <section className="comic-page-stage" style={{ '--comic-zoom': zoom / 100 }}>
        <div className={`comic-page${panels.length === 0 ? ' empty' : ''}`}>
          {panels.length === 0 ? (
            <p className="comic-empty-state">当前页面还没有真实画格。先拆解脚本，或生成/保存画格后会出现在这里。</p>
          ) : panels.map((panel, index) => (
            <button
              className={`comic-frame ${panel.layout} ${panel.id === selectedPanelID ? 'selected' : ''}`}
              type="button"
              key={panel.id}
              onClick={() => selectPanel(panel.id)}
            >
              {renderComicPreview(panel.src, '空画格')}
              {panel.caption ? <span className={`comic-bubble ${index === 0 ? 'caption' : ''}`}>{panel.caption}</span> : null}
              <em>{index + 1}</em>
            </button>
          ))}
        </div>
      </section>
      <div className="comic-zoom-tools">
        <button type="button" onClick={() => setZoom((value) => Math.max(45, value - 6))}>-</button>
        <span>{zoom}%</span>
        <button type="button" onClick={() => setZoom((value) => Math.min(110, value + 6))}>+</button>
      </div>
    </main>
  );

  const renderAssetPanel = () => (
    <aside className="comic-asset-panel">
      <div className="comic-panel-heading">
        <strong>资产库</strong>
        <button type="button" onClick={() => setActiveTool('资产库')}>
          <ImagePlus size={14} />
        </button>
      </div>
      <div className="comic-asset-search">
        <Search size={16} />
        <input value={assetQuery} onChange={(event) => setAssetQuery(event.target.value)} placeholder="搜索资产（角色 / 场景 / 道具）" />
        <button type="button" aria-label="筛选资产" onClick={() => setAssetTab((tab) => (tab === '收藏' ? '人物' : '收藏'))}><ChevronDown size={16} /></button>
      </div>
      <div className="comic-asset-tabs">
        {['人物', '场景', '道具', '收藏'].map((tab) => (
          <button className={assetTab === tab ? 'active' : ''} type="button" key={tab} onClick={() => setAssetTab(tab)}>
            {tab}
          </button>
        ))}
      </div>
      <div className="comic-selected-inspector">
        <strong>当前画格</strong>
        <span>{selectedBeat.title} · {selectedBeat.shot}</span>
        <textarea value={selectedPanel.caption} onChange={(event) => updatePanelCaption(event.target.value)} placeholder="输入对白或旁白" />
      </div>
      <div className="comic-asset-grid">
        {visibleAssets.length === 0 ? (
          <p className="comic-empty-state">还没有真实资产。拆书或生成资产后会出现在这里。</p>
        ) : visibleAssets.map((asset) => (
          <article className={`comic-asset-card${asset.id === selectedAssetID ? ' active' : ''}`} key={asset.id}>
            <button type="button" onClick={() => setSelectedAssetID(asset.id)}>
              {renderComicPreview(asset.src, '无图片')}
            </button>
            <button className="comic-asset-meta" type="button" onClick={() => setSelectedAssetID(asset.id)}>
              <strong>{asset.title}</strong>
              <span>{asset.type}</span>
            </button>
            <button className={asset.favorite ? 'favorite active' : 'favorite'} type="button" aria-label="收藏资产" onClick={() => toggleFavoriteAsset(asset.id)}>
              <Star size={14} fill={asset.favorite ? 'currentColor' : 'none'} />
            </button>
          </article>
        ))}
      </div>
      <div className="comic-asset-actions">
        <button className="primary" type="button" onClick={() => applyAssetToPanel(selectedAsset)}>
          <ImagePlus size={16} /> 拖入画格
        </button>
        <button type="button" onClick={() => generateSelectedAsset(true)} disabled={busyAction === 'generate-asset'}>
          {busyAction === 'generate-asset' ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />} 替换画面
        </button>
        <button type="button" onClick={() => selectedAsset && toggleFavoriteAsset(selectedAsset.id)}>
          <Star size={16} /> 收藏
        </button>
      </div>
    </aside>
  );

  const renderAssemblyWorkspace = () => (
    <>
      {renderScriptPanel()}
      {renderCanvas()}
      {renderAssetPanel()}
    </>
  );

  const renderToolWorkspace = () => {
    if (activeTool === '拆解脚本') {
      return (
        <main className="comic-tool-workspace">
          <section className="comic-tool-main">
            <header className="comic-tool-hero">
              <span><WandSparkles size={18} /> Script Breakdown</span>
              <strong>把小说文本拆成可生成的分镜、角色、场景和道具</strong>
              <small>拆书会扣 3 积分。结果会写入当前页面，并把识别出的资产送入资产库。</small>
            </header>
            <label className="comic-large-input">
              <span>小说文本</span>
              <textarea value={novelDraft} onChange={(event) => setNovelDraft(event.target.value)} />
            </label>
            <div className="comic-tool-actions">
              <button className="primary" type="button" onClick={() => {
                if (!novelDraft.trim()) {
                  showToast('请输入小说文本');
                  return;
                }
                runComicAction('parse-script', async () => {
                  const oldText = scriptSourceText;
                  setScriptBeats((items) => items.map((beat, index) => (index === 0 ? { ...beat, summary: novelDraft.slice(0, 52) } : beat)));
                  if (!requireComicAuth()) return;
                  const payload = await authPostJSON('/api/v1/manga/script', session.token, {
                    workID: selectedWork?.id,
                    episodeID: selectedEpisode?.id,
                    pageID: selectedComicPage?.id,
                    text: novelDraft,
                  }, '拆书失败');
                  if (payload?.beats?.length) setScriptBeats(payload.beats);
                  if (payload?.assets?.length) setAssets((items) => mergeComicAssets(items, payload.assets.map(normalizeComicAsset)));
                  if (payload?.page) replacePageInWorks(payload.page);
                  if (payload?.work) replaceWork(payload.work);
                  if (payload?.user) onUserChange?.(payload.user);
                  showToast(`拆书完成，扣除 ${payload?.credits || 3} 积分`);
                  return oldText;
                });
              }}>
                {busyAction === 'parse-script' ? <LoaderCircle size={16} className="spin" /> : <WandSparkles size={16} />} 开始拆书
              </button>
              <button type="button" onClick={addScriptBeat}><Plus size={16} /> 手动新增分镜</button>
              <button type="button" onClick={() => navigator.clipboard?.writeText(scriptSourceText)}><Copy size={16} /> 复制分镜</button>
            </div>
            <div className="comic-breakdown-grid">
              {scriptBeats.map((beat, index) => (
                <article className={beat.id === selectedBeatID ? 'active' : ''} key={beat.id}>
                  <button type="button" onClick={() => selectBeat(beat.id)}>{index + 1}</button>
                  <div>
                    <strong>{beat.title}</strong>
                    <span>{beat.shot} · {beat.summary}</span>
                    <small>{beat.assets.join(' / ')}</small>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <aside className="comic-tool-side">
            <strong>拆解摘要</strong>
            <div className="comic-stat-stack">
              <span><b>{scriptBeats.length}</b> 分镜</span>
              <span><b>{new Set(scriptBeats.flatMap((beat) => beat.assets)).size}</b> 参考资产</span>
              <span><b>3</b> 积分/次</span>
            </div>
            <button type="button" onClick={() => setActiveTool('组装页面')}>进入组装页面</button>
          </aside>
        </main>
      );
    }
    if (activeTool === '资产库') {
      return (
        <main className="comic-tool-workspace">
          <section className="comic-tool-main">
            <header className="comic-tool-hero compact">
              <span><ImageIcon size={18} /> Asset Library</span>
              <strong>统一管理角色、场景和道具，随时拖入画格复用</strong>
            </header>
            <div className="comic-library-toolbar">
              <label><Search size={16} /><input value={assetQuery} onChange={(event) => setAssetQuery(event.target.value)} placeholder="搜索资产名称或提示词" /></label>
              {['人物', '场景', '道具', '收藏'].map((tab) => (
                <button className={assetTab === tab ? 'active' : ''} type="button" key={tab} onClick={() => setAssetTab(tab)}>{tab}</button>
              ))}
            </div>
            <section className="comic-library-grid">
              {visibleAssets.length === 0 ? (
                <p className="comic-empty-state">还没有真实资产。完成拆书或点击生成资产后，后端保存的角色、场景和道具会显示在这里。</p>
              ) : visibleAssets.map((asset) => (
                <article className={asset.id === selectedAssetID ? 'active' : ''} key={asset.id}>
                  <button type="button" onClick={() => setSelectedAssetID(asset.id)}>{renderComicPreview(asset.src, '无图片')}</button>
                  <div>
                    <strong>{asset.title}</strong>
                    <span>{asset.type}</span>
                  </div>
                  <footer>
                    <button type="button" onClick={() => applyAssetToPanel(asset)}>拖入</button>
                    <button type="button" onClick={() => toggleFavoriteAsset(asset.id)}>{asset.favorite ? '已收藏' : '收藏'}</button>
                  </footer>
                </article>
              ))}
            </section>
          </section>
          <aside className="comic-tool-side">
            <strong>{selectedAsset?.title || '选择资产'}</strong>
            {selectedAsset ? <div className="comic-side-preview">{renderComicPreview(selectedAsset.src, '无图片')}</div> : <p className="comic-empty-state">请选择一个真实资产。</p>}
            <label>资产提示词<textarea value={selectedAsset?.prompt || `${selectedAsset?.title || ''}，漫画资产设定`} onChange={(event) => {
              const value = event.target.value;
              setAssets((items) => items.map((asset) => (asset.id === selectedAssetID ? { ...asset, prompt: value } : asset)));
            }} /></label>
            <button className="primary" type="button" onClick={() => generateSelectedAsset(false)} disabled={busyAction === 'generate-asset'}>
              {busyAction === 'generate-asset' ? '生成中...' : '生成/刷新资产（3 积分）'}
            </button>
            <button type="button" onClick={() => selectedAsset && applyAssetToPanel(selectedAsset)}>应用到当前画格</button>
          </aside>
        </main>
      );
    }
    if (activeTool === '对白气泡') {
      return (
        <main className="comic-tool-workspace">
          <section className="comic-tool-main">
            <header className="comic-tool-hero compact">
              <span><MessageCircle size={18} /> Dialogue</span>
              <strong>集中编辑旁白、对白和气泡样式</strong>
            </header>
            <section className="comic-dialogue-list">
              {panels.map((panel, index) => (
                <article className={panel.id === selectedPanelID ? 'active' : ''} key={panel.id}>
                  <button type="button" onClick={() => selectPanel(panel.id)}>第 {index + 1} 格</button>
                  <textarea value={panel.caption} placeholder="输入对白、旁白或音效文字" onChange={(event) => {
                    setSelectedPanelID(panel.id);
                    setPanels((items) => items.map((item) => (item.id === panel.id ? { ...item, caption: event.target.value } : item)));
                  }} />
                </article>
              ))}
            </section>
          </section>
          <aside className="comic-tool-side">
            <strong>气泡设置</strong>
            <div className="comic-segment-group">
              {['圆角气泡', '旁白框', '爆炸音效'].map((item) => (
                <button className={bubbleShape === item ? 'active' : ''} type="button" key={item} onClick={() => setBubbleShape(item)}>{item}</button>
              ))}
            </div>
            <label>当前画格<textarea value={selectedPanel?.caption || ''} onChange={(event) => updatePanelCaption(event.target.value)} /></label>
            <button className="primary" type="button" onClick={saveCurrentPage}>保存对白</button>
            <button type="button" onClick={() => setActiveTool('组装页面')}>回到画布预览</button>
          </aside>
        </main>
      );
    }
    if (activeTool === '样式/字体') {
      return (
        <main className="comic-tool-workspace">
          <section className="comic-tool-main">
            <header className="comic-tool-hero compact">
              <span><Type size={18} /> Style System</span>
              <strong>控制页面规格、漫画调性、字体和画格模板</strong>
            </header>
            <div className="comic-style-board">
              <label>页面尺寸<select value={pageSize} onChange={(event) => setPageSize(event.target.value)}><option>A4 竖版</option><option>Webtoon 长条</option><option>方形社媒页</option></select></label>
              <label>分镜模板<select value={panelTemplate} onChange={(event) => setPanelTemplate(event.target.value)}><option>经典 6 格</option><option>动作 4 格</option><option>长镜头 3 格</option></select></label>
              <label>字体<select value={letteringStyle} onChange={(event) => setLetteringStyle(event.target.value)}><option>黑体对白</option><option>手写漫画体</option><option>宋体旁白</option></select></label>
              <label>画面调性<select value={pageTone} onChange={(event) => setPageTone(event.target.value)}><option>黑白高反差</option><option>网点灰阶</option><option>暗紫点缀</option></select></label>
            </div>
            <section className="comic-style-preview">
              <div className="comic-page mini">
                {panels.length === 0 ? (
                  <p className="comic-empty-state">暂无真实画格</p>
                ) : panels.slice(0, 4).map((panel, index) => (
                  <span className={`comic-frame ${index === 0 ? 'wide' : ''}`} key={panel.id}>
                    {renderComicPreview(panel.src, '空画格')}
                    {panel.caption ? <b>{panel.caption}</b> : null}
                  </span>
                ))}
              </div>
            </section>
          </section>
          <aside className="comic-tool-side">
            <strong>排版开关</strong>
            <label className="comic-toggle-line"><input type="checkbox" checked={autoLayout} onChange={(event) => setAutoLayout(event.target.checked)} /> 自动排版</label>
            <label className="comic-toggle-line"><input type="checkbox" checked={showPanelGuides} onChange={(event) => setShowPanelGuides(event.target.checked)} /> 显示画格参考线</label>
            <button className="primary" type="button" onClick={() => showToast('样式已应用到当前页面')}>应用样式</button>
            <button type="button" onClick={saveCurrentPage}>保存为页面默认</button>
          </aside>
        </main>
      );
    }
    if (activeTool === '我的收藏') {
      return (
        <main className="comic-tool-workspace">
          <section className="comic-tool-main">
            <header className="comic-tool-hero compact">
              <span><Star size={18} /> Favorites</span>
              <strong>收藏的角色、场景、道具和可复用画面</strong>
            </header>
            <section className="comic-library-grid favorites">
              {favoriteAssets.length > 0 ? favoriteAssets.map((asset) => (
                <article key={asset.id}>
                  <button type="button" onClick={() => setSelectedAssetID(asset.id)}>{renderComicPreview(asset.src, '无图片')}</button>
                  <div><strong>{asset.title}</strong><span>{asset.type}</span></div>
                  <footer><button type="button" onClick={() => applyAssetToPanel(asset)}>拖入</button><button type="button" onClick={() => toggleFavoriteAsset(asset.id)}>取消收藏</button></footer>
                </article>
              )) : <p className="comic-empty-state">还没有收藏资产。去资产库点星标，常用素材会出现在这里。</p>}
            </section>
          </section>
          <aside className="comic-tool-side">
            <strong>收藏统计</strong>
            <div className="comic-stat-stack">
              <span><b>{favoriteAssets.length}</b> 收藏资产</span>
              <span><b>{favoriteAssets.filter((asset) => asset.type === '人物').length}</b> 人物</span>
              <span><b>{favoriteAssets.filter((asset) => asset.type === '场景').length}</b> 场景</span>
            </div>
            <button type="button" onClick={() => { setAssetTab('收藏'); setActiveTool('资产库'); }}>管理收藏</button>
          </aside>
        </main>
      );
    }
    return (
      <main className="comic-tool-workspace">
        <section className="comic-tool-main">
          <header className="comic-tool-hero compact">
            <span><Settings size={18} /> Studio Settings</span>
            <strong>作品、生成、保存和导出设置</strong>
          </header>
          <div className="comic-settings-grid">
            <label>作品名<input value={selectedWork?.title || ''} onChange={(event) => setWorks((items) => items.map((work) => (work.id === selectedWorkID ? { ...work, title: event.target.value } : work)))} /></label>
            <label>当前章节<input value={selectedEpisode?.title || ''} onChange={(event) => setWorks((items) => items.map((work) => (work.id === selectedWorkID ? { ...work, episodes: work.episodes.map((episode) => (episode.id === selectedEpisodeID ? { ...episode, title: event.target.value } : episode)) } : work)))} /></label>
            <label className="comic-toggle-line"><input type="checkbox" checked={autoSaveDraft} onChange={(event) => setAutoSaveDraft(event.target.checked)} /> 自动保存草稿</label>
            <label className="comic-toggle-line"><input type="checkbox" checked={matureFilter} onChange={(event) => setMatureFilter(event.target.checked)} /> 开启安全过滤</label>
          </div>
          <section className="comic-settings-cards">
            <article>
              <strong>生成策略</strong>
              <span>当前按画格或资产单张生成，每张扣 3 积分，失败自动退款。</span>
              <button type="button" onClick={() => setActiveTool('资产库')}>管理生成资产</button>
            </article>
            <article>
              <strong>页面输出</strong>
              <span>导出当前漫画页为可预览 HTML，后续可接入 PNG/PDF 服务端渲染。</span>
              <button type="button" onClick={exportComicPage}>导出当前页</button>
            </article>
            <article>
              <strong>工作区偏好</strong>
              <span>{pageSize} · {panelTemplate} · {pageTone}</span>
              <button type="button" onClick={() => setActiveTool('样式/字体')}>调整样式</button>
            </article>
          </section>
          <div className="comic-tool-actions">
            <button className="primary" type="button" onClick={saveCurrentPage}>保存设置</button>
            <button type="button" onClick={exportComicPage}><Download size={16} /> 导出当前页</button>
            <button type="button" onClick={() => setQueue([])}>清空生成队列</button>
          </div>
        </section>
        <aside className="comic-tool-side">
          <strong>当前项目</strong>
          <div className="comic-stat-stack">
            <span><b>{selectedWork?.episodes.length || 0}</b> 话</span>
            <span><b>{selectedEpisode?.pages.length || 0}</b> 页</span>
            <span><b>{queue.length}</b> 队列任务</span>
          </div>
          <button type="button" onClick={() => setComicView('works')}>返回作品管理</button>
        </aside>
      </main>
    );
  };

  const managerTitle = comicView === 'works'
    ? '作品管理'
    : comicView === 'episodes'
      ? `${selectedWork?.title || '作品'} · 话数管理`
      : `${selectedWork?.title || '作品'} · ${selectedEpisode?.title || '章节'} · 页面管理`;

  if (comicView === 'works') {
    return (
      <div className="comic-studio-shell comic-manager-shell" role="dialog" aria-modal="true" aria-label="AI 漫画作品管理">
        <header className="comic-topbar comic-manager-topbar">
          <div className="comic-brand">
            <img src="/assets/berserk-ai-icon.png" alt="" />
            <strong>Neo AI</strong>
            <span>AI 漫画</span>
          </div>
          <div className="comic-project-title">
            <strong>{managerTitle}</strong>
          </div>
          <div className="comic-controls">
            <button type="button" onClick={createWork}><Plus size={15} /> 新建作品</button>
            <button type="button" onClick={() => showToast('作品排序已更新')}><RefreshCw size={15} /> 最近更新</button>
            <button className="comic-close" type="button" aria-label="关闭 AI 漫画" onClick={onClose}><X size={18} /></button>
          </div>
        </header>
        <main className="comic-manager-page">
          <section className="comic-manager-hero">
            <div>
              <strong>作品管理</strong>
              <span>每个作品可以包含 N 话，每一话可以继续管理 N 页漫画页面。</span>
            </div>
            <label>
              <Search size={16} />
              <input placeholder="搜索作品、角色或章节" />
            </label>
          </section>
          <section className="comic-work-grid">
            {!session?.token ? (
              <div className="comic-manager-empty">
                <strong>登录后查看真实漫画作品</strong>
                <span>AI 漫画作品、章节、页面和资产都来自后端账户数据。</span>
                <button type="button" onClick={onAuthOpen}>登录 Neo AI</button>
              </div>
            ) : comicLoading ? (
              <div className="comic-manager-empty">
                <LoaderCircle size={24} className="spin" />
                <strong>正在加载真实作品</strong>
              </div>
            ) : works.length === 0 ? (
              <div className="comic-manager-empty">
                <strong>还没有漫画作品</strong>
                <span>创建第一个作品后，后端保存的数据会显示在这里。</span>
                <button type="button" onClick={createWork}>新建作品</button>
              </div>
            ) : works.map((work) => {
              const pageCount = work.episodes.reduce((count, episode) => count + episode.pages.length, 0);
              return (
                <article className="comic-work-card" key={work.id}>
                  <button type="button" onClick={() => openWork(work.id)}>
                    {renderComicPreview(work.cover, '无封面')}
                  </button>
                  <div>
                    <strong>{work.title}</strong>
                    <span>{work.subtitle}</span>
                    <small>{work.episodes.length} 话 · {pageCount} 页 · {work.updatedAt}</small>
                  </div>
                  <footer>
                    <button type="button" onClick={() => openWork(work.id)}>管理话数</button>
                    <button type="button" onClick={() => {
                      setSelectedWorkID(work.id);
                      setSelectedEpisodeID(work.episodes[0]?.id || '');
                      applyPageState(work.episodes[0]?.pages[0]);
                      setComicView('editor');
                    }}>继续编辑</button>
                  </footer>
                </article>
              );
            })}
          </section>
        </main>
        {toast ? <div className="comic-toast">{toast}</div> : null}
      </div>
    );
  }

  if (comicView === 'episodes' || comicView === 'pages') {
    const pageMode = comicView === 'pages';
    return (
      <div className="comic-studio-shell comic-manager-shell" role="dialog" aria-modal="true" aria-label="AI 漫画章节管理">
        <header className="comic-topbar comic-manager-topbar">
          <div className="comic-brand">
            <img src="/assets/berserk-ai-icon.png" alt="" />
            <strong>Neo AI</strong>
            <span>AI 漫画</span>
          </div>
          <button className="comic-back" type="button" onClick={() => setComicView(pageMode ? 'episodes' : 'works')}>
            <ChevronLeft size={16} /> {pageMode ? '返回话数' : '返回作品'}
          </button>
          <div className="comic-project-title">
            <strong>{managerTitle}</strong>
          </div>
          <div className="comic-controls">
            {pageMode ? (
              <button type="button" onClick={addPage}><Plus size={15} /> 新增页面</button>
            ) : (
              <button type="button" onClick={addEpisode}><Plus size={15} /> 新增一话</button>
            )}
            <button className="primary" type="button" onClick={() => setComicView('editor')}><PanelsTopLeft size={15} /> 打开编辑器</button>
            <button className="comic-close" type="button" aria-label="关闭 AI 漫画" onClick={onClose}><X size={18} /></button>
          </div>
        </header>
        <main className="comic-manager-page">
          {!pageMode ? (
            <section className="comic-episode-list">
              {selectedWork?.episodes.length ? selectedWork.episodes.map((episode) => (
                <article className={episode.id === selectedEpisodeID ? 'active' : ''} key={episode.id}>
                  <button type="button" onClick={() => openEpisode(episode.id)}>
                    {renderComicPreview(episode.pages[0]?.thumb || selectedWork.cover, '无封面')}
                  </button>
                  <div>
                    <strong>{episode.title}</strong>
                    <span>{episode.summary}</span>
                    <small>{episode.pages.length} 页 · {episode.status}</small>
                  </div>
                  <footer>
                    <button type="button" onClick={() => openEpisode(episode.id)}>管理页面</button>
                    <button type="button" onClick={() => {
                      setSelectedEpisodeID(episode.id);
                      applyPageState(episode.pages[0]);
                      setComicView('editor');
                    }}>编辑本话</button>
                  </footer>
                </article>
              )) : (
                <div className="comic-manager-empty">
                  <strong>还没有真实话数</strong>
                  <span>新增一话后会写入后端并显示在这里。</span>
                  <button type="button" onClick={addEpisode}>新增一话</button>
                </div>
              )}
            </section>
          ) : (
            <section className="comic-page-manager-grid">
              {selectedEpisode?.pages.map((page, index) => (
                <article className={page.id === selectedComicPageID ? 'active' : ''} key={page.id}>
                  <button type="button" onClick={() => openPage(page.id)}>
                    {renderComicPreview(page.thumb, '空白页')}
                    <em>{index + 1}</em>
                  </button>
                  <div>
                    <strong>{page.title}</strong>
                    <span>{page.status}</span>
                  </div>
                  <footer>
                    <button type="button" onClick={() => openPage(page.id)}>编辑页面</button>
                    <button type="button" onClick={() => duplicateCurrentPage(page.id)}>复制</button>
                  </footer>
                </article>
              ))}
              {!selectedEpisode?.pages.length ? (
                <div className="comic-manager-empty">
                  <strong>还没有真实页面</strong>
                  <span>新增页面后会保存到后端。</span>
                </div>
              ) : null}
              <button className="comic-page-create-card" type="button" onClick={addPage}>
                <Plus size={24} />
                新增页面
              </button>
            </section>
          )}
        </main>
        {toast ? <div className="comic-toast">{toast}</div> : null}
      </div>
    );
  }

  return (
    <div className="comic-studio-shell" role="dialog" aria-modal="true" aria-label="AI 漫画工作台">
      <header className="comic-topbar">
        <div className="comic-brand">
          <img src="/assets/berserk-ai-icon.png" alt="" />
          <strong>Neo AI</strong>
          <span>AI 漫画</span>
        </div>
        <button className="comic-back" type="button" onClick={() => setComicView('pages')}>
          <ChevronLeft size={16} /> 返回页面
        </button>
        <div className="comic-project-title">
          <strong>《{selectedWork?.title || '漫画作品'}》{selectedEpisode?.title || '当前话'} · {selectedComicPage?.title || '当前页'}</strong>
          <button type="button" aria-label="编辑项目名"><Brush size={14} /></button>
        </div>
        <div className="comic-controls">
          <label>
            页面尺寸
            <select value={pageSize} onChange={(event) => setPageSize(event.target.value)}>
              <option>A4 竖版</option>
              <option>Webtoon 长条</option>
              <option>方形社媒页</option>
            </select>
          </label>
          <label>
            分镜模板
            <select value={panelTemplate} onChange={(event) => setPanelTemplate(event.target.value)}>
              <option>经典 6 格</option>
              <option>动作 4 格</option>
              <option>长镜头 3 格</option>
            </select>
          </label>
          <button className={autoLayout ? 'active' : ''} type="button" onClick={() => setAutoLayout((value) => !value)}>
            <PanelTop size={15} /> 自动排版
          </button>
          <button type="button" onClick={regeneratePanel} disabled={busyAction === 'generate-panel'}>
            {busyAction === 'generate-panel' ? <LoaderCircle size={15} className="spin" /> : <WandSparkles size={15} />} 生成所选画格
          </button>
          <button type="button" onClick={exportComicPage}>
            <Download size={15} /> 导出页面
          </button>
          <button className="primary" type="button" onClick={saveCurrentPage} disabled={busyAction === 'save-page'}>
            {busyAction === 'save-page' ? <LoaderCircle size={15} className="spin" /> : <ShieldCheck size={15} />} 保存草稿
          </button>
          <button className="comic-close" type="button" aria-label="关闭 AI 漫画" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </header>

      <aside className="comic-left-rail" aria-label="漫画工具">
        {toolItems.map(([label, Icon]) => (
          <button className={activeTool === label ? 'active' : ''} type="button" key={label} title={label} onClick={() => {
            setActiveTool(label);
            if (label === '我的收藏') setAssetTab('收藏');
          }}>
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
      </aside>

      {activeTool === '组装页面' ? renderAssemblyWorkspace() : renderToolWorkspace()}

      <footer className="comic-bottom-bar">
        <div className="comic-page-strip">
          <button type="button" onClick={() => setComicView('pages')}>页面管理 <ChevronDown size={14} /></button>
          {selectedEpisode?.pages.map((page) => (
            <button className={selectedComicPageID === page.id ? 'active' : ''} type="button" key={page.id} onClick={() => openPage(page.id)}>
              {renderComicPreview(page.thumb, '空白页')}
              <span>{page.title}</span>
            </button>
          ))}
          <button className="comic-new-page" type="button" onClick={addPage}>
            <Plus size={18} /> 新建页面
          </button>
        </div>
        <div className="comic-queue">
          <header>
            <strong>生成队列</strong>
            <span>{queue.length}</span>
            <button type="button" onClick={() => setQueue([])}>清空队列</button>
          </header>
          <div>
            {queue.map((item) => (
              <article key={item.id}>
                {renderComicPreview(item.src, '任务')}
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                  <em>{item.status}{item.progress > 0 ? ` ${item.progress}%` : ''}</em>
                  {item.progress > 0 ? <i style={{ width: `${item.progress}%` }} /> : null}
                </span>
                <button type="button" onClick={() => setQueue((items) => items.filter((candidate) => candidate.id !== item.id))}>
                  <X size={14} />
                </button>
              </article>
            ))}
          </div>
        </div>
      </footer>
      {toast ? <div className="comic-toast">{toast}</div> : null}
    </div>
  );
}

function AppModal({ title, message, tone = 'info', onClose }) {
  useEscape(onClose);
  return (
    <div className="app-modal-backdrop" onMouseDown={onClose}>
      <div className={`app-modal ${tone}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <img className="app-modal-decoration" src="/assets/modal-crystal-decoration.png" alt="" />
        <button className="app-modal-close" type="button" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </button>
        <h2>{title}</h2>
        <p>{message}</p>
        <button className="app-modal-primary" type="button" onClick={onClose}>知道了</button>
      </div>
    </div>
  );
}

function SizeEditorModal({ onClose }) {
  const outputFormats = [
    { label: 'PNG', value: 'png', mime: 'image/png', extension: 'png' },
    { label: 'JPG', value: 'jpg', mime: 'image/jpeg', extension: 'jpg', quality: 0.92 },
    { label: 'WebP', value: 'webp', mime: 'image/webp', extension: 'webp', quality: 0.9 },
  ];
  const [imageSrc, setImageSrc] = useState('');
  const [imageName, setImageName] = useState('');
  const [originalSize, setOriginalSize] = useState({ width: 0, height: 0 });
  const [widthInput, setWidthInput] = useState('');
  const [heightInput, setHeightInput] = useState('');
  const [aspectLocked, setAspectLocked] = useState(true);
  const [outputFormat, setOutputFormat] = useState('png');
  const [message, setMessage] = useState('');
  const imageRef = useRef(null);

  useEscape(onClose);

  const originalRatio = originalSize.width > 0 && originalSize.height > 0 ? originalSize.width / originalSize.height : 1;
  const selectedFormat = outputFormats.find((format) => format.value === outputFormat) || outputFormats[0];
  const outputWidth = clampDimensionInput(widthInput, originalSize.width || 1024);
  const outputHeight = clampDimensionInput(heightInput, originalSize.height || 1024);

  const setLinkedSize = (dimension, value) => {
    const cleanValue = value.replace(/[^\d]/g, '');
    if (dimension === 'width') {
      setWidthInput(cleanValue);
      if (aspectLocked && cleanValue && originalRatio > 0) {
        setHeightInput(String(Math.max(1, Math.round(Number(cleanValue) / originalRatio))));
      }
      return;
    }
    setHeightInput(cleanValue);
    if (aspectLocked && cleanValue && originalRatio > 0) {
      setWidthInput(String(Math.max(1, Math.round(Number(cleanValue) * originalRatio))));
    }
  };

  const toggleAspectLock = () => {
    setAspectLocked((locked) => {
      if (!locked && originalRatio > 0 && widthInput) {
        setHeightInput(String(Math.max(1, Math.round(Number(widthInput) / originalRatio))));
      }
      return !locked;
    });
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageName(file.name);
    setMessage('');
    setOriginalSize({ width: 0, height: 0 });
    setWidthInput('');
    setHeightInput('');
    const reader = new FileReader();
    reader.onload = () => setImageSrc(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const handleImageLoad = (event) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (!naturalWidth || !naturalHeight) return;
    setOriginalSize({ width: naturalWidth, height: naturalHeight });
    setWidthInput(String(naturalWidth));
    setHeightInput(String(naturalHeight));
  };

  const exportImage = () => {
    const image = imageRef.current;
    if (!image || !image.complete) {
      setMessage('请先上传图片。');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setMessage('导出失败，请换个浏览器重试。');
      return;
    }
    if (selectedFormat.mime === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, outputWidth, outputHeight);
    }
    context.drawImage(image, 0, 0, outputWidth, outputHeight);
    const link = document.createElement('a');
    link.download = `neo-ai-${outputWidth}x${outputHeight}.${selectedFormat.extension}`;
    link.href = canvas.toDataURL(selectedFormat.mime, selectedFormat.quality);
    link.click();
    setMessage(`已导出 ${outputWidth} x ${outputHeight} 的 ${selectedFormat.label} 图片。`);
  };

  return (
    <div className="size-editor-overlay" role="dialog" aria-modal="true" aria-label="格式/尺寸修改器" onMouseDown={onClose}>
      <div className="size-editor" onMouseDown={(event) => event.stopPropagation()}>
        <button className="size-editor-close" type="button" aria-label="关闭格式/尺寸修改器" onClick={onClose}>
          <X size={18} />
        </button>
        <header>
          <strong>格式/尺寸修改器</strong>
          <span>上传图片后选择导出格式，并输入指定宽高。</span>
        </header>
        <section className="size-editor-body">
          <aside>
            <div className="size-editor-controls">
              <label className="size-upload">
                <ImageIcon size={20} />
                <span>{imageName || '选择本地图片'}</span>
                <input type="file" accept="image/*" onChange={handleFile} />
              </label>
              {originalSize.width > 0 ? (
                <div className="size-original-size">
                  <span>原图尺寸</span>
                  <strong>{originalSize.width} x {originalSize.height}</strong>
                </div>
              ) : null}
              <span className="size-section-label">导出格式</span>
              <div className="size-format-grid" aria-label="导出格式">
                {outputFormats.map((format) => (
                  <button
                    className={outputFormat === format.value ? 'active' : ''}
                    type="button"
                    key={format.value}
                    onClick={() => setOutputFormat(format.value)}
                  >
                    {format.label}
                  </button>
                ))}
              </div>
              <span className="size-section-label">指定尺寸</span>
              <div className="size-inputs">
                <label>
                  宽度
                  <input
                    inputMode="numeric"
                    value={widthInput}
                    placeholder="宽度"
                    onChange={(event) => setLinkedSize('width', event.target.value)}
                  />
                </label>
                <label>
                  高度
                  <input
                    inputMode="numeric"
                    value={heightInput}
                    placeholder="高度"
                    onChange={(event) => setLinkedSize('height', event.target.value)}
                  />
                </label>
                <button className={`size-lock-button${aspectLocked ? ' locked' : ''}`} type="button" onClick={toggleAspectLock} aria-pressed={aspectLocked} aria-label={aspectLocked ? '解除比例锁定' : '锁定原图比例'}>
                  {aspectLocked ? <Lock size={15} /> : <Unlock size={15} />}
                  <span>{aspectLocked ? '按原图比例锁定' : '已解除比例锁定'}</span>
                </button>
                <span className="size-lock-status">
                  {aspectLocked ? '按原图比例锁定' : '已解除比例锁定'}
                </span>
              </div>
              {message ? <p>{message}</p> : null}
            </div>
            <button className="size-export" type="button" onClick={exportImage}>
              <Download size={17} /> 导出 {selectedFormat.label}
            </button>
          </aside>
          <div className="size-crop-area">
            {imageSrc ? (
              <div className="size-image-wrap">
                <img ref={imageRef} src={imageSrc} alt="" onLoad={handleImageLoad} draggable={false} />
                <span className="crop-size-label">{outputWidth} x {outputHeight} · {selectedFormat.label}</span>
              </div>
            ) : (
              <div className="size-empty">
                <ImageIcon size={34} />
                <strong>上传图片后开始转换</strong>
                <span>选择 PNG、JPG 或 WebP，并输入要导出的宽高。</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function AuthModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [codeSent, setCodeSent] = useState(false);
  const cleanEmail = email.trim().toLowerCase();
  const isRegister = mode === 'register';
  const isCodeLogin = mode === 'login-code';
  const isResetPassword = mode === 'reset-password';
  const needsCode = isRegister || isCodeLogin || isResetPassword;
  const title = isRegister ? '注册 Neo AI' : isResetPassword ? '重置登录密码' : '欢迎来到 Neo AI';
  const subtitle = isRegister ? '注册后即可保存你的创作记录' : isResetPassword ? '用邮箱验证码确认身份后设置新密码' : '登录后同步保存你的灵感与作品';
  const canRequestCode = Boolean(cleanEmail) && (!isRegister || password.trim().length >= 8);
  const canSubmit =
    cleanEmail &&
    (isCodeLogin
      ? code.trim().length === 6
      : isResetPassword
        ? password.trim().length >= 8 && confirmPassword.trim().length >= 8 && code.trim().length === 6
        : isRegister
          ? password.trim().length >= 8 && code.trim().length === 6
          : Boolean(password.trim()));

  useEscape(onClose);

  useEffect(() => {
    if (countdown <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setCountdown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const resetTransientState = () => {
    setCodeSent(false);
    setCode('');
    setStatusMessage('');
    setError('');
    setCountdown(0);
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setPassword('');
    setConfirmPassword('');
    resetTransientState();
  };

  const handleRequestCode = async () => {
    setError('');
    setStatusMessage('');
    setIsSendingCode(true);
    try {
      const result = await requestEmailCode({ email: cleanEmail, mode: isRegister ? 'register' : isResetPassword ? 'reset' : 'login' });
      setCountdown(result?.expiresIn || 90);
      setCodeSent(true);
      setStatusMessage(`验证码已发送到 ${cleanEmail}。`);
    } catch (requestError) {
      setError(getErrorMessage(requestError, '验证码发送失败'));
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setStatusMessage('');
    if (isResetPassword && password !== confirmPassword) {
      setError('两次输入的新密码不一致。');
      return;
    }
    setIsSubmitting(true);
    try {
      let session;
      if (isRegister) {
        session = await registerWithEmail({ email: cleanEmail, password, code });
      } else if (isCodeLogin) {
        session = await loginWithEmailCode({ email: cleanEmail, code });
      } else if (isResetPassword) {
        const verification = await verifyEmailCode({ email: cleanEmail, code, mode: 'reset' });
        session = await resetEmailPassword({ email: cleanEmail, password, setupToken: verification.setupToken });
      } else {
        session = await loginWithPassword({ email: cleanEmail, password });
      }
      onSuccess(session);
    } catch (submitError) {
      setError(getErrorMessage(submitError, isRegister ? '注册失败' : isResetPassword ? '重置密码失败' : '登录失败'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-overlay" role="dialog" aria-modal="true" aria-label={isRegister ? '邮箱注册' : '邮箱登录'} onClick={onClose}>
      <div className="auth-card" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close auth-close" aria-label="关闭登录" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="auth-panel">
          <div className="auth-mark">
            <img src="/assets/berserk-ai-icon.png" alt="" />
            <span>NEO AI</span>
          </div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                resetTransientState();
              }}
              placeholder="name@example.com"
              autoComplete="email"
              required
            />
            {!isCodeLogin ? (
              <input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (isRegister) resetTransientState();
                }}
                placeholder={isRegister || isResetPassword ? '设置登录密码（至少 8 位）' : '登录密码'}
                autoComplete={isRegister || isResetPassword ? 'new-password' : 'current-password'}
                required
              />
            ) : null}
            {isResetPassword ? (
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入新密码"
                autoComplete="new-password"
                required
              />
            ) : null}
            {needsCode ? (
              <div className="auth-code-line">
                <input
                  id="auth-code"
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="邮箱验证码"
                  autoComplete="one-time-code"
                  required
                />
                <button className="auth-code-button" type="button" onClick={handleRequestCode} disabled={!canRequestCode || isSendingCode || countdown > 0}>
                  {isSendingCode ? '发送中' : countdown > 0 ? `${countdown}s` : codeSent ? '重发' : '获取验证码'}
                </button>
              </div>
            ) : null}
            {mode === 'login' ? (
              <button className="auth-switch" type="button" onClick={() => switchMode('login-code')}>
                使用邮箱验证码登录
              </button>
            ) : null}
            {mode === 'login' ? (
              <button className="auth-switch" type="button" onClick={() => switchMode('reset-password')}>
                忘记密码？用邮箱验证码重置
              </button>
            ) : null}
            {isCodeLogin ? (
              <button className="auth-switch" type="button" onClick={() => switchMode('login')}>
                使用密码登录
              </button>
            ) : null}
            {isResetPassword ? (
              <button className="auth-switch" type="button" onClick={() => switchMode('login')}>
                返回密码登录
              </button>
            ) : null}
            {error ? (
              <div className="auth-note error" role="alert">
                {error}
              </div>
            ) : null}
            {statusMessage ? <div className="auth-note">{statusMessage}</div> : null}
            <button className="auth-submit" type="submit" disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? <LoaderCircle size={18} /> : null}
              {isSubmitting ? (isRegister ? '注册中' : isResetPassword ? '重置中' : '登录中') : isRegister ? '使用邮箱注册' : isResetPassword ? '重置并登录' : isCodeLogin ? '验证码登录' : '登录'}
            </button>
            {isRegister ? (
              <button className="auth-help" type="button" onClick={() => switchMode('login')}>
                已有账号？去登录
              </button>
            ) : (
              <button className="auth-help" type="button" onClick={() => switchMode('register')}>
                注册账号
              </button>
            )}
          </form>
          <p className="auth-terms">登录或注册即表示您同意我们的服务条款和隐私政策。</p>
        </div>
      </div>
    </div>
  );
}

function PricingPage({ packages, authSession, onAuthOpen, onUserChange, onBack }) {
  const [redeemCardNo, setRedeemCardNo] = useState('');
  const [redeemPassword, setRedeemPassword] = useState('');
  const [redeemMessage, setRedeemMessage] = useState('');
  const [busyPackage, setBusyPackage] = useState('');
  const [openFaq, setOpenFaq] = useState('');

  const handlePurchase = async (pkg) => {
    if (!authSession?.token) {
      onAuthOpen();
      return;
    }
    setBusyPackage(pkg.id);
    setRedeemMessage('');
    try {
      const payload = await authPostJSON('/api/v1/credits/purchase', authSession.token, { packageID: pkg.id }, '创建订单失败');
      if (payload?.paymentURL) window.open(payload.paymentURL, '_blank', 'noopener,noreferrer');
      if (payload?.user) onUserChange(payload.user);
      setRedeemMessage(payload?.paymentURL ? '已打开卡密购买页面，支付后回到这里兑换卡密。' : '积分已到账。');
    } catch (error) {
      setRedeemMessage(getErrorMessage(error, '购买失败'));
    } finally {
      setBusyPackage('');
    }
  };

  const handleRedeem = async (event) => {
    event.preventDefault();
    if (!authSession?.token) {
      onAuthOpen();
      return;
    }
    setRedeemMessage('');
    try {
      const payload = await authPostJSON('/api/v1/credits/redeem', authSession.token, { cardNo: redeemCardNo.trim(), password: redeemPassword.trim() }, '卡密兑换失败');
      if (payload?.user) onUserChange(payload.user);
      setRedeemCardNo('');
      setRedeemPassword('');
      setRedeemMessage(`兑换成功，已到账 ${payload?.credits || 0} 积分。`);
    } catch (error) {
      setRedeemMessage(getErrorMessage(error, '兑换失败'));
    }
  };

  return (
    <section className="pricing-page">
      <nav className="pricing-nav" aria-label="订阅导航">
        <button type="button" onClick={onBack}>
          NEO AI
        </button>
        <div>
          <a href="#pricing-plans">积分套餐</a>
          <a href="#pricing-faq">常见问题</a>
          <button type="button" onClick={onBack}>
            立即创作
          </button>
        </div>
      </nav>
      <header className="pricing-hero">
        <h1>购买 Neo AI 积分</h1>
        <button type="button">一次性积分包</button>
        <p>图片生成 3 积分/张。通过卡密平台购买后，回到本页输入卡密兑换积分。</p>
        <div className="payment-coming">微信支付、支付宝支付即将上线</div>
      </header>
      <form className="redeem-panel" onSubmit={handleRedeem}>
        <div>
          <strong>卡密兑换</strong>
          <span>输入卡号和密码，在这里兑换到当前账号。</span>
        </div>
        <input value={redeemCardNo} onChange={(event) => setRedeemCardNo(event.target.value)} placeholder="卡号" />
        <input value={redeemPassword} onChange={(event) => setRedeemPassword(event.target.value)} placeholder="密码" />
        <button type="submit">兑换积分</button>
      </form>
      {redeemMessage ? <p className="redeem-message">{redeemMessage}</p> : null}
      <div className="pricing-grid" id="pricing-plans">
        {packages.map((pkg) => (
          <article className={`pricing-card ${pkg.tone}${pkg.popular ? ' popular' : ''}`} key={pkg.id}>
            {pkg.popular ? <em>推荐</em> : null}
            <img className="pricing-icon" src={pkg.icon} alt="" />
            <h2>{pkg.name}</h2>
            <div className="price-line">
              <strong>{pkg.price}</strong>
            </div>
            <div className="zap-amount">
              <Zap size={22} fill="currentColor" /> {pkg.credits}
            </div>
            <ul>
              {pkg.features.map((feature) => (
                <li key={feature}>✓ {feature}</li>
              ))}
            </ul>
            <button type="button" onClick={() => handlePurchase(pkg)} disabled={busyPackage === pkg.id}>
              {busyPackage === pkg.id ? '处理中' : pkg.paymentURL ? '去购买卡密' : '购买积分'}
            </button>
          </article>
        ))}
      </div>
      <section className="pricing-proof">
        <h2>按需购买，不绑定订阅</h2>
        <p>积分包适合灵活创作：买多少用多少，生成失败会按后端状态退还积分。</p>
        <div>
          <span>3 积分 / 张图片</span>
          <span>立即到账</span>
          <span>支持多次购买</span>
        </div>
      </section>
      <section className="pricing-faq" id="pricing-faq">
        <h2>常见问题</h2>
        {pricingFaqs.map((item) => (
          <div className={`faq-item${openFaq === item.question ? ' open' : ''}`} key={item.question}>
            <button
              type="button"
              aria-expanded={openFaq === item.question}
              onClick={() => setOpenFaq((current) => (current === item.question ? '' : item.question))}
            >
              {item.question} <ChevronDown size={18} />
            </button>
            {openFaq === item.question ? <p>{item.answer}</p> : null}
          </div>
        ))}
      </section>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <a className="footer-brand" href="#">
          <img src="/assets/berserk-ai-icon.png" alt="" /> Neo AI
        </a>
        <p>Copyright © 2026 保留所有权利。</p>
      </div>
      <div>
        <h3>AI 模型</h3>
        <a href="#">Gemini</a>
        <a href="#">NoobAI XL</a>
      </div>
      <div>
        <h3>插画工具</h3>
        <a href="#">角色创建器</a>
        <a href="#">AI 艺术生成器</a>
      </div>
      <div>
        <h3>动画工具</h3>
        <a href="#">AI 动画制作工具</a>
        <a href="#">AI 动态人像</a>
      </div>
      <div>
        <h3>漫画工具</h3>
        <a href="#">漫画画布</a>
        <a href="#">AI 漫画生成器</a>
      </div>
      <div>
        <h3>了解更多</h3>
        <a href="#">价格</a>
        <a href="#">博客</a>
      </div>
    </footer>
  );
}

function ShareModal({ session, onClose, onAuthOpen }) {
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const inviteCode = summary?.inviteCode || session?.user?.inviteCode || '';
  const inviteLink = useMemo(() => buildInviteLink(inviteCode), [inviteCode]);
  useEscape(onClose);

  useEffect(() => {
    if (!session?.token) {
      setLoading(false);
      onAuthOpen?.();
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    getJSON('/api/v1/referrals/me', session.token)
      .then((payload) => {
        if (!cancelled) setSummary(payload?.summary || null);
      })
      .catch((error) => {
        if (!cancelled) setMessage(getErrorMessage(error, '邀请信息加载失败'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.token, onAuthOpen]);

  const handleCopy = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard?.writeText(inviteLink);
      setMessage('邀请链接已复制。');
    } catch {
      setMessage('复制失败，请手动选择链接。');
    }
  };

  const handleSystemShare = async () => {
    if (!navigator.share || !inviteLink) {
      handleCopy();
      return;
    }
    try {
      await navigator.share({
        title: 'Neo AI 邀请',
        text: '用我的邀请链接注册 Neo AI，一起领积分创作图片。',
        url: inviteLink,
      });
      setMessage('分享面板已打开。');
    } catch {
      setMessage('');
    }
  };

  return (
    <div className="share-overlay" role="dialog" aria-modal="true" aria-label="分享邀请" onClick={onClose}>
      <section className="share-modal" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close share-close" type="button" aria-label="关闭分享" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="share-hero">
          <strong>分享有礼，积分多多</strong>
          <span>好友通过链接注册，您得 10 积分；好友充值到账积分时，您再得 10% 返佣。</span>
        </div>
        <ul className="share-steps">
          <li><Link2 size={21} /> 分享您的邀请链接</li>
          <li><ShieldCheck size={21} /> 好友通过链接完成注册</li>
          <li><Gift size={21} /> 奖励自动进入积分账户</li>
        </ul>
        <div className="share-stats">
          <span>邀请注册</span>
          <strong>{loading ? '-' : Number(summary?.usedCount || 0).toLocaleString('zh-CN')}</strong>
          <span>累计奖励</span>
          <strong>{loading ? '-' : Number(summary?.rewardCredits || 0).toLocaleString('zh-CN')} 积分</strong>
        </div>
        <div className="share-link-box">
          <Link2 size={20} />
          <input value={inviteLink || (loading ? '邀请链接生成中...' : '请登录后生成邀请链接')} readOnly />
          <button type="button" onClick={handleCopy} disabled={!inviteLink}>
            <Copy size={18} /> 复制链接
          </button>
        </div>
        <button className="share-primary" type="button" onClick={handleSystemShare} disabled={!inviteLink}>
          <Gift size={18} /> 立即分享
        </button>
        {message ? <p>{message}</p> : null}
      </section>
    </div>
  );
}

function ProfileModal({ session, onClose, onAuthOpen, onUserChange, onSessionChange }) {
  const user = session?.user;
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [avatarURL, setAvatarURL] = useState(user?.avatarURL || '');
  const [signature, setSignature] = useState(user?.signature || '');
  const [gender, setGender] = useState(user?.gender || '');
  const [activeTab, setActiveTab] = useState('profile');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [resetSendingCode, setResetSendingCode] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(0);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const profileEmail = user?.email || '';

  useEscape(onClose);

  useEffect(() => {
    if (resetCountdown <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setResetCountdown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resetCountdown]);

  const handleAvatarFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatarURL(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!session?.token) {
      onAuthOpen();
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const updated = await authPatchJSON('/api/v1/me/profile', session.token, { displayName, avatarURL, signature, gender }, '保存资料失败');
      onUserChange(updated);
      setMessage('资料已保存。');
    } catch (error) {
      setMessage(getErrorMessage(error, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    if (!session?.token) {
      onAuthOpen();
      return;
    }
    if (newPassword.trim().length < 8) {
      setPasswordMessage('新密码至少需要 8 位。');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage('两次输入的新密码不一致。');
      return;
    }
    setPasswordSaving(true);
    setPasswordMessage('');
    try {
      await authPatchJSON('/api/v1/me/password', session.token, { currentPassword, newPassword }, '修改密码失败');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('密码已更新。');
    } catch (error) {
      setPasswordMessage(getErrorMessage(error, '修改失败'));
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleResetCodeRequest = async () => {
    if (!profileEmail) {
      setResetMessage('当前账号没有可验证的邮箱。');
      return;
    }
    setResetSendingCode(true);
    setResetMessage('');
    try {
      const result = await requestEmailCode({ email: profileEmail, mode: 'reset' });
      setResetCountdown(result?.expiresIn || 90);
      setResetCodeSent(true);
      setResetMessage(`验证码已发送到 ${profileEmail}。`);
    } catch (error) {
      setResetMessage(getErrorMessage(error, '验证码发送失败'));
    } finally {
      setResetSendingCode(false);
    }
  };

  const handleEmailResetSubmit = async (event) => {
    event.preventDefault();
    if (!profileEmail) {
      setResetMessage('当前账号没有可验证的邮箱。');
      return;
    }
    if (resetCode.trim().length !== 6) {
      setResetMessage('请输入 6 位邮箱验证码。');
      return;
    }
    if (resetNewPassword.trim().length < 8) {
      setResetMessage('新密码至少需要 8 位。');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetMessage('两次输入的新密码不一致。');
      return;
    }
    setResetSaving(true);
    setResetMessage('');
    try {
      const verification = await verifyEmailCode({ email: profileEmail, code: resetCode, mode: 'reset' });
      const sessionPayload = await resetEmailPassword({ email: profileEmail, password: resetNewPassword, setupToken: verification.setupToken });
      if (sessionPayload?.token && sessionPayload?.user) {
        onSessionChange(sessionPayload);
      } else if (sessionPayload?.user) {
        onUserChange(sessionPayload.user);
      }
      setResetCode('');
      setResetNewPassword('');
      setResetConfirmPassword('');
      setResetCodeSent(false);
      setResetCountdown(0);
      setResetMessage('密码已通过邮箱验证更新。');
    } catch (error) {
      setResetMessage(getErrorMessage(error, '重置密码失败'));
    } finally {
      setResetSaving(false);
    }
  };

  return (
    <div className="profile-overlay" role="dialog" aria-modal="true" aria-label="用户资料" onClick={onClose}>
      <div className="profile-card" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close profile-close" type="button" aria-label="关闭资料卡" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="profile-hero">
          <label className="avatar-picker">
            {avatarURL ? <img src={avatarURL} alt="" /> : <span>{(user?.email || 'N').slice(0, 1).toUpperCase()}</span>}
            <input type="file" accept="image/*" onChange={handleAvatarFile} />
          </label>
          <div>
            <strong>{user?.email || '未登录用户'}</strong>
            <span>{user?.credits ?? 0} Zaps</span>
          </div>
        </div>
        <div className="profile-tabs" role="tablist" aria-label="个人中心设置">
          <button className={activeTab === 'profile' ? 'active' : ''} type="button" role="tab" aria-selected={activeTab === 'profile'} onClick={() => setActiveTab('profile')}>
            个人资料
          </button>
          <button className={activeTab === 'password' ? 'active' : ''} type="button" role="tab" aria-selected={activeTab === 'password'} onClick={() => setActiveTab('password')}>
            密码安全
          </button>
        </div>
        {activeTab === 'profile' ? (
          <form className="profile-form" onSubmit={handleSubmit}>
            <label>
              昵称
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="给自己起个创作者名字" />
            </label>
            <label>
              性别
              <select value={gender} onChange={(event) => setGender(event.target.value)}>
                <option value="">不展示</option>
                <option value="female">女</option>
                <option value="male">男</option>
                <option value="nonbinary">非二元</option>
              </select>
            </label>
            <label>
              个性签名
              <textarea value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="写一句会显示在资料卡上的创作宣言" />
            </label>
            {message ? <p>{message}</p> : null}
            <button type="submit" disabled={saving}>
              {saving ? '保存中' : '保存资料'}
            </button>
          </form>
        ) : (
          <div className="profile-security-panel">
            <form className="profile-password-form" onSubmit={handlePasswordSubmit}>
              <div className="profile-section-title">
                <KeyRound size={17} />
                <strong>使用当前密码修改</strong>
              </div>
              <label>
                当前密码
                <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="输入当前密码" autoComplete="current-password" />
              </label>
              <label>
                新密码
                <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="至少 8 位" autoComplete="new-password" />
              </label>
              <label>
                确认新密码
                <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次输入新密码" autoComplete="new-password" />
              </label>
              {passwordMessage ? <p>{passwordMessage}</p> : null}
              <button type="submit" disabled={passwordSaving}>
                {passwordSaving ? '更新中' : '更新密码'}
              </button>
            </form>
            <form className="profile-password-form profile-reset-form" onSubmit={handleEmailResetSubmit}>
              <div className="profile-section-title">
                <Mail size={17} />
                <strong>忘记密码，用邮箱验证重置</strong>
              </div>
              <label>
                验证邮箱
                <input value={profileEmail} readOnly placeholder="当前账号邮箱" />
              </label>
              <div className="profile-code-line">
                <label>
                  邮箱验证码
                  <input type="text" inputMode="numeric" value={resetCode} onChange={(event) => setResetCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 位验证码" autoComplete="one-time-code" />
                </label>
                <button type="button" onClick={handleResetCodeRequest} disabled={!profileEmail || resetSendingCode || resetCountdown > 0}>
                  {resetSendingCode ? '发送中' : resetCountdown > 0 ? `${resetCountdown}s` : resetCodeSent ? '重发' : '获取验证码'}
                </button>
              </div>
              <label>
                新密码
                <input type="password" value={resetNewPassword} onChange={(event) => setResetNewPassword(event.target.value)} placeholder="至少 8 位" autoComplete="new-password" />
              </label>
              <label>
                确认新密码
                <input type="password" value={resetConfirmPassword} onChange={(event) => setResetConfirmPassword(event.target.value)} placeholder="再次输入新密码" autoComplete="new-password" />
              </label>
              {resetMessage ? <p>{resetMessage}</p> : null}
              <button type="submit" disabled={resetSaving}>
                {resetSaving ? '重置中' : '通过邮箱验证重置'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function useEscape(onClose) {
  useEffect(() => {
    const handleKeydown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [onClose]);
}

function readStoredAuthSession() {
  try {
    return JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function readStyleFavorites() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STYLE_FAVORITES_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readCreditAdjustmentNotices() {
  try {
    const value = JSON.parse(window.localStorage.getItem(CREDIT_ADJUSTMENT_NOTICE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readInviteCode() {
  return window.localStorage.getItem(INVITE_CODE_STORAGE_KEY) || '';
}

function buildInviteLink(inviteCode) {
  const code = String(inviteCode || '').trim();
  if (!code) return '';
  const url = new URL(window.location.href);
  url.searchParams.set('ref', code);
  url.hash = '';
  return url.toString();
}

async function requestEmailCode({ email, mode }) {
  return postJSON('/api/v1/auth/email/code', { email: email.trim().toLowerCase(), mode, appID: AUTH_APP_ID }, '验证码发送失败');
}

async function verifyEmailCode({ email, code, mode }) {
  return postJSON('/api/v1/auth/email/verify', { email: email.trim().toLowerCase(), code: code.trim(), mode, appID: AUTH_APP_ID }, '验证码验证失败');
}

async function resetEmailPassword({ email, password, setupToken }) {
  return postJSON('/api/v1/auth/email/reset', { email: email.trim().toLowerCase(), password, setupToken, appID: AUTH_APP_ID }, '重置密码失败');
}

async function loginWithEmailCode({ email, code }) {
  return postJSON('/api/v1/auth/email/login', { email: email.trim().toLowerCase(), code: code.trim(), appID: AUTH_APP_ID }, '登录失败');
}

async function loginWithPassword({ email, password }) {
  return postJSON('/api/v1/auth/email/login', { email: email.trim().toLowerCase(), password, appID: AUTH_APP_ID }, '登录失败');
}

async function registerWithEmail({ email, password, code }) {
  return postJSON(
    '/api/v1/auth/email/register',
    { email: email.trim().toLowerCase(), password, code: code.trim(), appID: AUTH_APP_ID, inviteCode: readInviteCode() },
    '注册失败',
  );
}

function normalizeCreditPackage(pkg) {
  const credits = Number(pkg.credits || 0);
  const price = `¥${Math.round(Number(pkg.amountCents || 0) / 100)}`;
  const fallbackIcons = {
    credits_trial: '/pricing-icons/package-trial.png',
    credits_100: '/pricing-icons/package-100.png',
    credits_500: '/pricing-icons/package-500.png',
    credits_1000: '/pricing-icons/package-1000.png',
  };
  return {
    id: pkg.id,
    name: pkg.name,
    price,
    credits: `${credits.toLocaleString('zh-CN')} 积分`,
    icon: pkg.icon || fallbackIcons[pkg.id] || `/pricing-icons/${pkg.id}.png`,
    paymentURL: pkg.paymentURL || '',
    tone: credits >= 1000 ? 'gold' : credits >= 500 ? 'purple' : 'blue',
    popular: pkg.id === 'credits_500' || credits === 550,
    features: [`可兑换 ${credits.toLocaleString('zh-CN')} 积分`, `约可生成 ${Math.max(1, Math.floor(credits / IMAGE_CREDIT_COST))} 张基础模型图片`, '支持卡密兑换到账', '积分长期保留'],
  };
}

function sizeToBackendSize(size) {
  const map = {
    '自动': '1024x1360',
    '1:1': '1024x1024',
    '3:4': '1024x1360',
    '4:5': '1024x1280',
    '4:3': '1360x1024',
    '9:16': '1024x1792',
    '16:9': '1792x1024',
    '21:9': '1792x768',
    '2:3': '1024x1536',
    '5:4': '1280x1024',
    '3:2': '1536x1024',
  };
  return map[size] || '1024x1360';
}

function relativeTime(value) {
  if (!value) return '刚刚';
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return '刚刚';
  const seconds = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function formatViews(value) {
  const count = Number(value || 0);
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(Math.max(0, Math.round(count)));
}

function clampDimensionInput(value, fallback) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(4096, Math.max(128, parsed));
}

async function getJSON(path, token = '') {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const response = await fetch(`${API_BASE_URL}${path}`, { headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(localizeError(payload?.message, `请求失败（${response.status}）`));
  return payload;
}

async function preloadGalleryImages(urls) {
  const uniqueURLs = Array.from(new Set(urls.filter(Boolean)));
  if (uniqueURLs.length === 0) return;
  const timeout = new Promise((resolve) => window.setTimeout(resolve, 1800));
  const load = Promise.allSettled(
    uniqueURLs.map((url) => new Promise((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (image.decode) {
          image.decode().then(resolve).catch(resolve);
          return;
        }
        resolve();
      };
      image.onerror = resolve;
      image.src = url;
    })),
  );
  await Promise.race([load, timeout]);
}

function authPostJSON(path, token, body, fallbackMessage) {
  return authedJSON(path, token, 'POST', body, fallbackMessage);
}

function authPatchJSON(path, token, body, fallbackMessage) {
  return authedJSON(path, token, 'PATCH', body, fallbackMessage);
}

async function authedJSON(path, token, method, body, fallbackMessage) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(localizeError(payload?.message, `${fallbackMessage}（${response.status}）`));
  }
  return payload;
}

async function postJSON(path, body, fallbackMessage) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(localizeError(payload?.message, `${fallbackMessage}（${response.status}）`));
  }
  return payload;
}

function getErrorMessage(error, fallbackMessage) {
  return error instanceof Error ? localizeError(error.message, fallbackMessage) : fallbackMessage;
}

function localizeError(message, fallbackMessage = '操作失败，请稍后重试') {
  const text = String(message || '').trim();
  const dictionary = {
    'Failed to fetch': '无法连接到后端服务，请确认本地 8080 服务已启动',
    'NetworkError when attempting to fetch resource.': '网络请求失败，请稍后重试',
    'smtp is not configured': '邮箱服务未配置',
    'email already registered': '该邮箱已经注册',
    'email is not registered': '该邮箱尚未注册',
    'invalid email': '邮箱地址不正确',
    'invalid or expired code': '验证码无效或已过期',
    '验证码无效或已过期，请重新获取': '验证码无效或已过期，请重新获取',
    'invalid or expired verification': '邮箱验证已过期，请重新获取验证码',
    'password must be at least 8 characters': '密码至少需要 8 位',
    'invalid email or password': '邮箱或密码不正确',
    '当前密码不正确': '当前密码不正确',
    '该账号尚未设置邮箱密码': '该账号尚未设置邮箱密码',
    'credits are not enough': '积分不足，请先充值',
    '已有图片正在生成，请完成后再提交新的任务': '已有图片正在生成，请完成后再提交新的任务',
    'invalid image task payload': '生图请求格式不正确',
    'prompt is required': '请输入提示词',
    'invalid image model': '请选择可用的生图模型',
    'create image task failed': '创建生成任务失败，请稍后重试',
    '图片尺寸不符合模型要求，系统已修正尺寸配置，请重新生成': '图片尺寸不符合模型要求，系统已修正尺寸配置，请重新生成',
  };
  if (dictionary[text]) return dictionary[text];
  if (/invalid size|divisible by 16|invalid_value/i.test(text)) return '图片尺寸不符合模型要求，系统已修正尺寸配置，请重新生成';
  if (/^[\x00-\x7F\s.,:;!?()'"/_-]+$/.test(text)) return fallbackMessage;
  return text || fallbackMessage;
}

export default App;

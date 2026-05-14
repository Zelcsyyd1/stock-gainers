let allData = [], screenCandidates = [], watchlist = [];
let page = 1, board = 'all';
let autoInterval = null, countdown = 30;
let sortCol = 'change_pct', sortDir = 'desc';
let isScreenMode = false, isWatchlistMode = false;
let autoScreenDone = false; // 防止同一天重复自动选股
let currentUser = null;
const FETCH_SIZE = 300;   // 后端每次拉取总数
const PAGE_SIZE  = 50;    // 每页显示数

// 默认设置
const DEFAULT_SETTINGS = { min_pct:3, max_pct:5, max_cap:200, min_vr:1, min_tr:5, max_tr:10, browser_notif:false, auto_screen:false, webhook:'' };
let settings = { ...DEFAULT_SETTINGS };

let isSearchMode = false;
let searchResults = [];
let searchTimer = null;

let chartData = null, chartTab = 'kline';
let currentKlt = 101, chartKltCache = {}, chartCurrentCode = '';

let compareList = [];

let isSectorMode = false, currentSectorType = 'industry';

let isLimitupMode = false;

let activeQuickFilter = null;

let currentTheme = localStorage.getItem('theme') || 'dark';

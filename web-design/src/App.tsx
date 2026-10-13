import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  authClient,
  AuthClientError,
  initialsOf,
  oauthDemo,
  onSessionChange,
  type AuthSession,
  type GoogleAccount,
} from "./api/auth";
import {
  apiClient,
  bank,
  books,
  currency,
  customers,
  flights,
  handoffs,
  hotels,
  learning,
  music,
  sql,
  type Account,
  type Book,
  type LessonProgress,
  type Transaction,
  type Customer,
  type Dashboard,
  type DbTable,
  type EndpointGroup,
  type ExplorerResponse,
  type Flight,
  type HomeData,
  type Hotel,
  isSettled,
  UPLOAD_EXTENSIONS,
  UPLOAD_MAX_BYTES,
  type LessonTask,
  type Material,
  type MaterialKind,
  type MaterialPage,
  type MaterialStatus,
  type NetworkCall,
  type Playlist,
  type Room,
  type Track,
} from "./lib/api";
import { subscribeNetwork } from "./lib/http";
import { runTests, SAMPLE_TESTS, type TestResult } from "./lib/assertions";
import { parseRoute, pathOf, PROTECTED_PAGES, type AppId, type Page } from "./lib/routes";

type Language = "az" | "en";
type Theme = "light" | "dark";

const LANGUAGE_KEY = "api-lab-language";
const storedLanguage = (): Language => {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "az";
  } catch {
    return "az";
  }
};

const translations = {
  az: {
    skipToContent: "Əsas məzmuna keç",
    navLabel: "Əsas naviqasiya",
    home: "Home",
    explorer: "Explorer",
    apps: "Apps",
    authLab: "Auth Lab",
    sql: "SQL",
    materials: "Materials",
    language: "Dil seçimi",
    themeToDark: "Dark mode-a keç",
    themeToLight: "Light mode-a keç",
    openMenu: "Menyunu aç",
    closeMenu: "Menyunu bağla",
    eyebrow: "Praktik API təlim platforması",
    heroTitle: "API-ni oxuma, çağır",
    heroDescription:
      "Real endpoint-lərə request göndər, response-ları araşdır və müasir API-lərin necə işlədiyini təcrübə ilə öyrən.",
    startLearning: "Öyrənməyə başla",
    openExplorer: "Explorer-i aç",
    learningPath: "3 mərhələli öyrənmə yolu",
    practiceLabel: "Canlı təcrübə",
    practiceValue: "Real request, təhlükəsiz sandbox",
    baseUrl: "Base URL",
    baseUrlDescription:
      "Bütün request-lər üçün bu təhlükəsiz təlim endpoint-indən istifadə et.",
    copy: "Kopyala",
    copied: "Kopyalandı",
    copyBaseUrl: "Base URL-i kopyala",
    demoUsers: "Demo istifadəçilər",
    demoUsersDescription:
      "Auth Lab-də token və role əsaslı icazələri yoxlamaq üçün hazır hesablar.",
    username: "İstifadəçi adı",
    password: "Şifrə",
    role: "Role",
    student: "Tələbə",
    administrator: "Admin",
    lessons: "Öyrənmə yolu",
    lessonsDescription:
      "Əsas anlayışlardan təhlükəsiz API design-a qədər addım-addım irəlilə.",
    lesson: "Dərs",
    lesson1Title: "API-yə giriş",
    lesson1Description:
      "İlk endpoint-i çağır, request və response strukturunu tanı.",
    lesson1Meta: "15 dəq · Başlanğıc",
    lesson2Title: "HTTP & REST",
    lesson2Description:
      "Method-lar, status code-lar, query və path parametrlərini öyrən.",
    lesson2Meta: "25 dəq · Əsaslar",
    lesson3Title: "Security & Design",
    lesson3Description:
      "JWT, OAuth, Bearer token, rate limit və Idempotency-Key ilə tanış ol.",
    lesson3Meta: "30 dəq · Orta",
    continueLesson: "Dərsə keç",
    quickStart: "Sürətli başlanğıc",
    quickStartDescription:
      "Terminal-da ilk GET request-ini göndər və JSON response al.",
    copyCode: "curl kodunu kopyala",
    responsePreview: "Gözlənilən response",
    responseReady: "200 OK · 42 ms",
    footerText: "API öyrənmək üçün təhlükəsiz təcrübə mühiti.",
    statusReady: "Sandbox aktivdir",
    results: "nəticə",
    materialsCount: "MATERİAL",
    expired: "Müddəti bitib",
    oauthPassword: "Parol",
    loadError: "Məlumat yüklənmədi",
    roomsLeft: "boş otaq",
    noResults: "Nəticə tapılmadı",
    testsPassed: "keçdi",
    testsNone: "Test yazılmayıb — Tests tab-ında assertion əlavə edin",
    testsHelp: "status, time, header, json $.path və ya pm.response.to.have.status(200)",
    tasksLabel: "tapşırıq",
    matSearch: "Material axtar",
    matUpload: "Material yüklə",
    matDrop: "Faylı bura sürüşdür və ya seç",
    matDropHint: "PDF, PPTX, DOCX, MD · maks. 50 MB",
    matTitle: "Başlıq",
    matLesson: "Dərs",
    matKind: "Növ",
    matGeneral: "Ümumi",
    matUploading: "Yüklənir…",
    matOpen: "Aç",
    matPages: "Səhifələr",
    matBack: "Materiallara qayıt",
    matReconvert: "Reconvert",
    matDelete: "Sil",
    matEdit: "Redaktə",
    matSave: "Yadda saxla",
    matSortOrder: "Sıra",
    matDeleteConfirm: "Material və bütün faylları silinsin?",
    matNoPreview: "Önizləmə yoxdur — faylı endirin",
    matFailed: "Konvertasiya alınmadı",
    matProcessing: "Hazırlanır…",
    matPage: "Səhifə",
    matPrev: "Əvvəlki",
    matNext: "Növbəti",
    matEmpty: "Bu dərs üçün hələ material yoxdur",
    matErrTooLarge: "Fayl çox böyükdür",
    matErrType: "Fayl tipi dəstəklənmir",
    matErrValidation: "Məlumatlar düzgün deyil",
    matErrOther: "Yükləmə alınmadı",
    matAll: "Hamısı",
    matUploadedBy: "Yükləyən",
    matLessonTasks: "Dərs tapşırıqları",
    matNoTasks: "Bu dərs üçün tapşırıq yoxdur",
    loading: "Məlumat yüklənir",
    beta: "BETA",
    live: "AKTİV",
    sendRequest: "Request göndər",
    sandbox: "SANDBOX",
    curriculum: "PROQRAM",
    accounts: "3 HESAB",
    quickStartKicker: "SÜRƏTLİ BAŞLANĞIC",
    terminal: "Terminal",
    copyright: `© ${new Date().getFullYear()} API Lab`,
    explorerTitle: "API Explorer",
    explorerSubtitle:
      "Endpoint seç, request-i hazırla və response-u real vaxtda araşdır.",
    endpointLibrary: "Endpoint kitabxanası",
    searchEndpoints: "Endpoint-ləri axtar",
    noEndpoints: "Uyğun endpoint tapılmadı",
    usersTag: "İstifadəçilər",
    authTag: "Auth",
    systemTag: "Sistem",
    listUsers: "İstifadəçiləri göstər",
    getUser: "İstifadəçi detalları",
    createUser: "İstifadəçi yarat",
    loginUser: "Daxil ol",
    refreshToken: "Token-i refresh et",
    rateLimitTest: "Rate limit-i yoxla",
    triggerError: "Error yarat",
    requestBuilder: "Request builder",
    environment: "Təlim mühiti",
    send: "Göndər",
    params: "Params",
    headers: "Headers",
    auth: "Auth",
    body: "Body",
    tests: "Tests",
    key: "Key",
    value: "Value",
    description: "Açıqlama",
    addParameter: "Parametr əlavə et",
    addHeader: "Header əlavə et",
    authType: "Auth növü",
    none: "None",
    apiKey: "API Key",
    basic: "Basic",
    bearerToken: "Bearer token",
    tokenPlaceholder: "Token-i daxil et",
    bodyJsonHint: "JSON payload",
    testsHint: "Response üçün JavaScript test-ləri yaz.",
    testsPlaceholder: "pm.test('Status code 200-dür', () => { ... })",
    response: "Response",
    pretty: "Pretty",
    raw: "Raw",
    copyAsCurl: "curl kimi kopyala",
    requestDetails: "Request detalları",
    responseEmptyTitle: "Request göndərməyə hazırsan",
    responseEmptyText:
      "Response body, headers, status code və timing burada görünəcək.",
    sendingRequest: "Request göndərilir",
    errorTitle: "Request tamamlanmadı",
    errorCode: "Error code",
    traceId: "traceId",
    retryTitle: "Rate limit-ə çatdın",
    retryText: "Yeni request göndərmək üçün gözlə:",
    seconds: "san",
    time: "Vaxt",
    size: "Ölçü",
    history: "History",
    historySubtitle: "Bu sessiyada göndərdiyin son request-lər.",
    clearHistory: "History-ni təmizlə",
    noHistory: "Hələ request göndərilməyib.",
    status: "Status",
    method: "Method",
    endpoint: "Endpoint",
    justNow: "indicə",
    requestPanel: "Request",
    endpointsPanel: "Endpoints",
    responsePanel: "Response",
    requestUrl: "Request URL",
    appsTitle: "Təcrübə Apps-ları",
    appsSubtitle:
      "Real məhsul interfeyslərində API call-ların necə işlədiyini öyrən.",
    appsKicker: "INTERAKTİV SANDBOX",
    openApp: "App-i aç",
    available: "Hazırdır",
    comingSoon: "Tezliklə",
    bank: "Bank",
    bankDescription: "Hesabları, kartları və transfer request-lərini idarə et.",
    currency: "Valyuta",
    currencyDescription: "Məzənnələri çevir və 7 günlük dəyişimi araşdır.",
    flights: "Uçuşlar",
    flightsDescription: "Uçuş axtarışı və booking flow-larını sına.",
    hotels: "Otellər",
    hotelsDescription: "Otaq availability və reservation API-lərini öyrən.",
    books: "Kitablar",
    booksDescription: "Kataloq, axtarış və review endpoint-lərini çağır.",
    music: "Musiqi",
    musicDescription: "Artist, playlist və streaming metadata-sı ilə işlə.",
    googleSignIn: "Google ilə daxil ol",
    googleDescription: "OAuth authorization flow-unu addım-addım izlə.",
    customers: "Müştərilər",
    customersDescription: "Customer profile və billing məlumatlarını idarə et.",
    backToApps: "Bütün Apps-lar",
    network: "Network",
    networkSubtitle: "UI tərəfindən edilən API call-lar",
    collapseNetwork: "Network panel-i bağla",
    expandNetwork: "Network panel-i aç",
    noNetworkCalls: "Hələ API call edilməyib.",
    openInExplorer: "Explorer-də aç",
    internalCalls: "Daxili call-lar",
    overview: "Ümumi baxış",
    totalBalance: "Ümumi balans",
    acrossAccounts: "3 hesab üzrə",
    accountsLabel: "Hesablar",
    cardsLabel: "Kartlar",
    recentActivity: "Son fəaliyyət",
    transferMoney: "Pul köçür",
    checking: "Gündəlik hesab",
    savings: "Yığım hesabı",
    business: "Biznes hesabı",
    availableBalance: "Mövcud balans",
    active: "ACTIVE",
    blocked: "BLOCKED",
    expires: "Bitmə tarixi",
    blockCard: "Kartı blokla",
    cardBlocked: "Kart bloklandı",
    blockCardTitle: "Kartı bloklamaq istəyirsən?",
    blockCardText:
      "Kart dərhal deaktiv ediləcək və yeni əməliyyatlar rədd olunacaq.",
    reason: "Səbəb",
    lost: "LOST",
    stolen: "STOLEN",
    suspectedFraud: "SUSPECTED_FRAUD",
    comment: "Şərh",
    commentPlaceholder: "Əlavə məlumat yaz",
    cancel: "Ləğv et",
    confirmBlock: "Bloklamanı təsdiqlə",
    fromAccount: "Göndərən hesab",
    recipientIban: "Alıcının IBAN-ı",
    amount: "Məbləğ",
    transferNote: "Qeyd",
    idempotencyKey: "Idempotency-Key",
    idempotencyHint: "Bu key təkrar transfer-in qarşısını alır.",
    sendTransfer: "Transfer göndər",
    transferComplete: "Transfer uğurla göndərildi",
    today: "Bu gün",
    cardPayment: "Kart ödənişi",
    salary: "Maaş",
    exchangeTitle: "Valyuta converter",
    exchangeSubtitle: "Canlı sandbox məzənnəsi ilə hesabla.",
    youSend: "Göndərirsən",
    youReceive: "Alırsan",
    swapCurrencies: "Valyutaları dəyiş",
    exchangeRate: "Məzənnə",
    marketTrend: "7 günlük trend",
    updatedNow: "İndicə yeniləndi",
    rateDisclaimer: "Təlim məqsədli mock məzənnə",
    high: "Yüksək",
    low: "Aşağı",
    appNavigation: "App naviqasiyası",
    flightSearch: "Uçuş axtar",
    flightSearchSubtitle: "Ən uyğun reysi tap və booking flow-u sına.",
    from: "Haradan",
    to: "Haraya",
    departureDate: "Gediş tarixi",
    adults: "Böyük",
    searchFlights: "Uçuşları axtar",
    flightResults: "Uyğun uçuşlar",
    flightsFound: "3 nəticə",
    filters: "Filter-lər",
    allFlights: "Bütün uçuşlar",
    directOnly: "Yalnız birbaşa",
    oneStop: "1 dayanacaq",
    sortBy: "Sırala",
    recommended: "Tövsiyə edilən",
    lowestPrice: "Ən aşağı qiymət",
    shortestDuration: "Ən qısa müddət",
    direct: "Birbaşa",
    stop: "dayanacaq",
    duration: "Müddət",
    perAdult: "bir böyük üçün",
    selectFlight: "Uçuşu seç",
    bookingSummary: "Booking xülasəsi",
    passengerDetails: "Sərnişin məlumatları",
    fullName: "Ad və soyad",
    email: "Email",
    confirmBooking: "Booking-i təsdiqlə",
    bookingConfirmed: "Booking təsdiqləndi",
    hotelSearch: "Otel axtar",
    hotelSearchSubtitle: "Şəhər, tarix və qonaq sayına görə otaq tap.",
    city: "Şəhər",
    checkIn: "Giriş",
    checkOut: "Çıxış",
    guests: "Qonaqlar",
    searchHotels: "Otelləri axtar",
    hotelResults: "Uyğun otellər",
    hotelsFound: "3 nəticə",
    guestRating: "Qonaq reytinqi",
    excellent: "Əla",
    veryGood: "Çox yaxşı",
    good: "Yaxşı",
    perNight: "gecəlik",
    taxesIncluded: "Vergilər daxildir",
    reserveRoom: "Otağı seç",
    amenities: "İmkanlar",
    freeWifi: "Pulsuz Wi-Fi",
    breakfast: "Səhər yeməyi",
    airportShuttle: "Airport shuttle",
    seaView: "Dəniz mənzərəsi",
    spa: "Spa",
    parking: "Parking",
    roomDetails: "Otaq detalları",
    standardRoom: "Standard otaq",
    roomUnavailable: "Otaq artıq mövcud deyil",
    roomUnavailableText:
      "Başqa qonaq bu otağı indicə booking etdi. Nəticələri yenilə və alternativ otaq seç.",
    refreshResults: "Nəticələri yenilə",
    tryAnotherRoom: "Başqa otaq seç",
    searchBooks: "Kitab axtar",
    booksSubtitle: "Başlıq və ya müəllifə görə kataloqda axtar.",
    allGenres: "Hamısı",
    fiction: "Bədii",
    technology: "Texnologiya",
    businessGenre: "Biznes",
    science: "Elm",
    byAuthor: "müəllif",
    pages: "səhifə",
    writeReview: "Review yaz",
    reviewTitle: "Review əlavə et",
    yourRating: "Sənin reytinqin",
    yourReview: "Sənin review-un",
    reviewPlaceholder: "Bu kitab haqqında fikirlərini yaz...",
    publishReview: "Review-u yayımla",
    reviewPublished: "Review yayımlandı",
    searchMusic: "Track, artist və ya album axtar",
    tracks: "Track-lər",
    playlists: "Playlist-lər",
    song: "Track",
    artist: "Artist",
    album: "Album",
    length: "Müddət",
    playTrack: "Track-i oynat",
    pauseTrack: "Track-i dayandır",
    nowPlaying: "İndi səslənir",
    showVideo: "YouTube preview-u göstər",
    hideVideo: "YouTube preview-u gizlət",
    songs: "track",
    customerDirectory: "Customer siyahısı",
    customerSubtitle: "Customer profile-larını yarat və idarə et.",
    createCustomer: "Customer yarat",
    editCustomer: "Customer-i redaktə et",
    deleteCustomer: "Customer-i sil",
    company: "Şirkət",
    created: "Yaradılıb",
    actions: "Əməliyyatlar",
    saveCustomer: "Customer-i saxla",
    updateMethod: "Update method",
    putDescription: "PUT bütün customer resource-u əvəz edir.",
    patchDescription: "PATCH yalnız dəyişən field-ləri yeniləyir.",
    deleteCustomerTitle: "Customer silinsin?",
    deleteCustomerText:
      "Bu əməliyyat customer profile-ını daimi siləcək və geri qaytarıla bilməz.",
    confirmDelete: "Silməni təsdiqlə",
    customerCreated: "Customer yaradıldı",
    customerUpdated: "Customer yeniləndi",
    googleConsent: "Google ilə davam et",
    googleConsentSubtitle:
      "API Lab hesabına daxil olmaq üçün mock OAuth flow-unu izlə.",
    oauthFlow: "OAuth flow",
    authorizationRequest: "Authorization request",
    userConsent: "İstifadəçi icazəsi",
    authorizationCode: "Authorization code",
    tokenExchange: "Token exchange",
    consentTitle: "API Lab bu məlumatlara giriş istəyir",
    consentAccount: "Daxil olunan hesab",
    consentPermissions: "API Lab aşağıdakılara giriş əldə edəcək:",
    viewProfile: "Ad və profile şəklini görmək",
    viewEmail: "Email ünvanını görmək",
    allow: "İcazə ver",
    deny: "İmtina et",
    continueFlow: "Növbəti addım",
    restartFlow: "Flow-u yenidən başlat",
    oauthComplete: "OAuth flow tamamlandı",
    oauthCompleteText: "Access token təhlükəsiz şəkildə əldə edildi.",
    currentStep: "Cari addım",
    total: "Cəmi",
    authLabTitle: "Auth Lab",
    authLabSubtitle:
      "Login, JWT və OAuth 2.0 flow-larını təhlükəsiz sandbox-da sına.",
    login: "Login",
    loginDescription: "Demo hesabla daxil ol və access token əldə et.",
    signIn: "Daxil ol",
    signingIn: "Daxil olunur",
    loginSuccess: "Login uğurludur",
    accessTokenReady: "Access token hazırdır",
    jwtDecoder: "JWT decoder",
    jwtDescription: "Token-in üç hissəsini oxu və payload-u araşdır.",
    pasteJwt: "JWT-ni daxil et",
    decode: "Decode et",
    jwtHeader: "Header",
    jwtPayload: "Payload",
    jwtSignature: "Signature",
    issuedAt: "Verilmə vaxtı",
    expiresAt: "Bitmə vaxtı",
    refresh: "Refresh et",
    tokenRefreshed: "Token refresh edildi",
    oauthSequence: "OAuth 2.0 Authorization Code",
    oauthSequenceSubtitle: "Authorization Code flow-un addımlarını izlə.",
    startAnimation: "Flow-u başlat",
    replayAnimation: "Yenidən göstər",
    browser: "Browser",
    authorizationServer: "Authorization server",
    apiServer: "API server",
    redirectToLogin: "Login səhifəsinə yönləndir",
    returnCode: "Authorization code qaytar",
    exchangeCode: "Code-u token ilə dəyiş",
    callApi: "Bearer token ilə API çağır",
    sqlPlayground: "SQL Playground",
    sqlSubtitle: "Təlim database-i üzərində təhlükəsiz SELECT query-ləri yaz.",
    selectOnly: "Yalnız SELECT",
    selectOnlyNotice:
      "Data təhlükəsizliyi üçün yalnız SELECT query-lərinə icazə verilir.",
    schemaTree: "Schema",
    tables: "Cədvəllər",
    columns: "Column-lar",
    sqlEditor: "SQL editor",
    runQuery: "Query-ni işə sal",
    runningQuery: "Query işləyir",
    formatQuery: "Query-ni formatla",
    quickQueries: "Hazır query-lər",
    allUsers: "Bütün istifadəçilər",
    activeCards: "Aktiv kartlar",
    recentBookings: "Son booking-lər",
    queryResults: "Query nəticələri",
    rowsReturned: "sətir qaytarıldı",
    queryTime: "Query vaxtı",
    sqlEmptyTitle: "Query işlətməyə hazırsan",
    sqlEmptyText: "Nəticələr burada cədvəl şəklində görünəcək.",
    sqlError: "Yalnız SELECT query-lərinə icazə verilir",
    materialsTitle: "Tədris materialları",
    materialsSubtitle:
      "Dərsləri təkrarla, praktik task-ları tamamla və faylları endir.",
    courseProgress: "Kurs irəliləyişi",
    completedTasks: "tamamlanmış task",
    lessonMaterials: "Dərs materialları",
    practicalTasks: "Praktik task-lar",
    markComplete: "Tamamlandı kimi işarələ",
    openInExplorerTask: "Explorer-də aç",
    checkWithSql: "SQL ilə yoxla",
    taskSendRequest: "GET /users endpoint-inə request göndər",
    taskInspectHeaders: "Response headers və status code-u yoxla",
    taskRefreshToken: "Vaxtı bitmiş token-i refresh et",
    taskSqlUsers: "Aktiv istifadəçiləri SQL ilə tap",
    taskIdempotency: "Idempotency-Key ilə transfer yarat",
    downloads: "Yükləmələr",
    downloadsSubtitle: "Offline təkrar və praktika üçün fayllar.",
    presentation: "Kurs təqdimatı",
    workbook: "Tələbə workbook-u",
    postmanCollection: "Postman collection",
    pptxFile: "PPTX faylı",
    pdfFile: "PDF faylı",
    jsonFile: "JSON collection",
    download: "Endir",
    lessonIntro: "API əsasları",
    lessonHttp: "HTTP, REST və status code-lar",
    lessonAuth: "Auth, JWT və OAuth",
    lessonData: "SQL və data yoxlaması",
    authenticationSandbox: "AUTHENTICATION SANDBOX",
    sequenceDiagram: "SEQUENCE DIAGRAM",
    dataLab: "DATA LAB",
    learningHub: "TƏDRİS MƏRKƏZİ",
    fourLessons: "4 DƏRS",
    signInToContinue: "Davam etmək üçün daxil ol",
    signInHeroTitle: "Real API-ləri çağırmaq üçün daxil ol",
    signInHeroSubtitle:
      "API Lab-də real request göndər, data-nı SQL ilə yoxla və Auth flow-larını təhlükəsiz mühitdə öyrən.",
    benefitEndpoints: "Real endpoint-lər və SQL ilə yoxlanılan data",
    benefitSandbox: "Təhlükəsiz təlim sandbox-u",
    benefitTools: "Postman və curl ilə işləyir",
    howItWorks:
      "Sign-in OAuth 2.0 Authorization Code flow-dan istifadə edir — Lesson 3-də öyrəndiyin eyni flow.",
    welcomeBack: "Xoş gəldin",
    continueWithGoogle: "Google ilə davam et",
    orLabel: "və ya",
    demoAccountsHelper: "Təlim sandbox-u üçün demo hesablar",
    privacyNote:
      "Yalnız adını və e-poçtunu sandbox profili yaratmaq üçün istifadə edirik. Heç bir data təlim mühitindən çıxmır.",
    profile: "Profile",
    tokenInfo: "Token info",
    signOut: "Çıxış et",
    expiresIn: "Bitməsinə qalıb",
    sessionExpired: "Token-in vaxtı bitib, refresh et",
    refreshSession: "Refresh",
    redirectAuthServer: "Auth Server-ə redirect",
    chooseAccount: "Hesab seç",
    consent: "İcazə",
    tokenExchangeStep: "Token exchange",
    useAnotherAccount: "Başqa hesab istifadə et",
    googleAccessTitle: "API Lab Google Account-na giriş istəyir",
    permissionIdentity: "Adını və e-poçtunu görmək",
    permissionSandbox: "Sandbox profile yaratmaq",
    mockGoogleNotice:
      "Təlim üçün mock Google ekranı. Real Google datası istifadə olunmur.",
    accessDenied: "Girişə icazə verilmədi",
    accessDeniedText: "Consent ləğv edildi. Heç bir data paylaşılmadı.",
    tryAgain: "Yenidən cəhd et",
    loadFailed: "Məlumat yüklənmədi",
    deleteFailed: "Silmək alınmadı",
    prevPage: "Əvvəlki",
    nextPage: "Növbəti",
    pageOf: "səhifə",
    invalidCode: "Kod yanlışdır və ya vaxtı bitib",
    invalidCodeText: "Authorization Code və ya state yoxlaması uğursuz oldu.",
    exchangingCode: "Code token ilə dəyişdirilir...",
    codeReceived: "Authorization code alındı",
    stateVerified: "state yoxlanıldı",
    accessTokenIssued: "access token yaradıldı",
    signedInAs: "Daxil oldun:",
    showHttpCalls: "HTTP call-ları göstər",
    hideHttpCalls: "HTTP call-ları gizlət",
    oauthRequests: "OAuth request-ləri",
    wrongCredentials: "İstifadəçi adı və ya şifrə yanlışdır",
    tooManyAttempts: "Çox sayda cəhd edildi",
    retryAfter: "Yenidən cəhd et:",
    authErrorCode: "Error code",
    authTraceId: "traceId",
    anotherAccountUnavailable:
      "Bu mock flow-da yalnız göstərilən təlim hesabları istifadə olunur.",
  },
  en: {
    skipToContent: "Skip to main content",
    navLabel: "Main navigation",
    home: "Home",
    explorer: "Explorer",
    apps: "Apps",
    authLab: "Auth Lab",
    sql: "SQL",
    materials: "Materials",
    language: "Language selection",
    themeToDark: "Switch to dark mode",
    themeToLight: "Switch to light mode",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    eyebrow: "Hands-on API learning platform",
    heroTitle: "Don't just read APIs, call them",
    heroDescription:
      "Send requests to real endpoints, inspect responses, and learn how modern APIs work through hands-on practice.",
    startLearning: "Start learning",
    openExplorer: "Open Explorer",
    learningPath: "3-step learning path",
    practiceLabel: "Live practice",
    practiceValue: "Real requests, safe sandbox",
    baseUrl: "Base URL",
    baseUrlDescription:
      "Use this safe training endpoint for all of your requests.",
    copy: "Copy",
    copied: "Copied",
    copyBaseUrl: "Copy Base URL",
    demoUsers: "Demo users",
    demoUsersDescription:
      "Ready-to-use accounts for testing tokens and role-based permissions in Auth Lab.",
    username: "Username",
    password: "Password",
    role: "Role",
    student: "Student",
    administrator: "Admin",
    lessons: "Learning path",
    lessonsDescription:
      "Progress step by step from core concepts to secure API design.",
    lesson: "Lesson",
    lesson1Title: "Introduction to APIs",
    lesson1Description:
      "Call your first endpoint and understand request and response structure.",
    lesson1Meta: "15 min · Beginner",
    lesson2Title: "HTTP & REST",
    lesson2Description:
      "Learn methods, status codes, query and path parameters.",
    lesson2Meta: "25 min · Fundamentals",
    lesson3Title: "Security & Design",
    lesson3Description:
      "Explore JWT, OAuth, Bearer tokens, rate limits, and Idempotency-Key.",
    lesson3Meta: "30 min · Intermediate",
    continueLesson: "Open lesson",
    quickStart: "Quick start",
    quickStartDescription:
      "Send your first GET request from the terminal and receive a JSON response.",
    copyCode: "Copy curl code",
    responsePreview: "Expected response",
    responseReady: "200 OK · 42 ms",
    footerText: "A safe practice environment for learning APIs.",
    statusReady: "Sandbox is live",
    results: "results",
    materialsCount: "MATERIALS",
    expired: "Expired",
    oauthPassword: "Password",
    loadError: "Could not load data",
    roomsLeft: "rooms available",
    noResults: "No results",
    testsPassed: "passed",
    testsNone: "No tests yet — add assertions in the Tests tab",
    testsHelp: "status, time, header, json $.path or pm.response.to.have.status(200)",
    tasksLabel: "tasks",
    matSearch: "Search materials",
    matUpload: "Upload material",
    matDrop: "Drag a file here or browse",
    matDropHint: "PDF, PPTX, DOCX, MD · max 50 MB",
    matTitle: "Title",
    matLesson: "Lesson",
    matKind: "Kind",
    matGeneral: "General",
    matUploading: "Uploading…",
    matOpen: "Open",
    matPages: "Pages",
    matBack: "Back to materials",
    matReconvert: "Reconvert",
    matDelete: "Delete",
    matEdit: "Edit",
    matSave: "Save",
    matSortOrder: "Order",
    matDeleteConfirm: "Delete the material and all of its files?",
    matNoPreview: "No preview — download the file",
    matFailed: "Conversion failed",
    matProcessing: "Processing…",
    matPage: "Page",
    matPrev: "Previous",
    matNext: "Next",
    matEmpty: "No materials for this lesson yet",
    matErrTooLarge: "File is too large",
    matErrType: "Unsupported file type",
    matErrValidation: "Invalid input",
    matErrOther: "Upload failed",
    matAll: "All",
    matUploadedBy: "Uploaded by",
    matLessonTasks: "Lesson tasks",
    matNoTasks: "No tasks for this lesson",
    loading: "Loading data",
    beta: "BETA",
    live: "LIVE",
    sendRequest: "Send request",
    sandbox: "SANDBOX",
    curriculum: "CURRICULUM",
    accounts: "3 ACCOUNTS",
    quickStartKicker: "QUICK START",
    terminal: "Terminal",
    copyright: `© ${new Date().getFullYear()} API Lab`,
    explorerTitle: "API Explorer",
    explorerSubtitle:
      "Choose an endpoint, build a request, and inspect the response in real time.",
    endpointLibrary: "Endpoint library",
    searchEndpoints: "Search endpoints",
    noEndpoints: "No matching endpoints",
    usersTag: "Users",
    authTag: "Auth",
    systemTag: "System",
    listUsers: "List users",
    getUser: "Get user details",
    createUser: "Create a user",
    loginUser: "Log in",
    refreshToken: "Refresh token",
    rateLimitTest: "Test rate limit",
    triggerError: "Trigger error",
    requestBuilder: "Request builder",
    environment: "Training environment",
    send: "Send",
    params: "Params",
    headers: "Headers",
    auth: "Auth",
    body: "Body",
    tests: "Tests",
    key: "Key",
    value: "Value",
    description: "Description",
    addParameter: "Add parameter",
    addHeader: "Add header",
    authType: "Auth type",
    none: "None",
    apiKey: "API Key",
    basic: "Basic",
    bearerToken: "Bearer token",
    tokenPlaceholder: "Enter token",
    bodyJsonHint: "JSON payload",
    testsHint: "Write JavaScript tests for the response.",
    testsPlaceholder: "pm.test('Status code is 200', () => { ... })",
    response: "Response",
    pretty: "Pretty",
    raw: "Raw",
    copyAsCurl: "Copy as curl",
    requestDetails: "Request details",
    responseEmptyTitle: "Ready when you are",
    responseEmptyText:
      "The response body, headers, status code, and timing will appear here.",
    sendingRequest: "Sending request",
    errorTitle: "Request could not be completed",
    errorCode: "Error code",
    traceId: "traceId",
    retryTitle: "You reached the rate limit",
    retryText: "Wait before sending a new request:",
    seconds: "sec",
    time: "Time",
    size: "Size",
    history: "History",
    historySubtitle: "Requests you sent during this session.",
    clearHistory: "Clear history",
    noHistory: "No requests sent yet.",
    status: "Status",
    method: "Method",
    endpoint: "Endpoint",
    justNow: "just now",
    requestPanel: "Request",
    endpointsPanel: "Endpoints",
    responsePanel: "Response",
    requestUrl: "Request URL",
    appsTitle: "Practice Apps",
    appsSubtitle:
      "Learn how API calls work inside real product interfaces.",
    appsKicker: "INTERACTIVE SANDBOX",
    openApp: "Open app",
    available: "Available",
    comingSoon: "Coming soon",
    bank: "Bank",
    bankDescription: "Manage accounts, cards, and transfer requests.",
    currency: "Currency",
    currencyDescription: "Convert rates and inspect seven days of movement.",
    flights: "Flights",
    flightsDescription: "Test flight search and booking flows.",
    hotels: "Hotels",
    hotelsDescription: "Learn room availability and reservation APIs.",
    books: "Books",
    booksDescription: "Call catalog, search, and review endpoints.",
    music: "Music",
    musicDescription: "Work with artist, playlist, and streaming metadata.",
    googleSignIn: "Sign in with Google",
    googleDescription: "Follow an OAuth authorization flow step by step.",
    customers: "Customers",
    customersDescription: "Manage customer profiles and billing data.",
    backToApps: "All Apps",
    network: "Network",
    networkSubtitle: "API calls made by the UI",
    collapseNetwork: "Collapse Network panel",
    expandNetwork: "Expand Network panel",
    noNetworkCalls: "No API calls yet.",
    openInExplorer: "Open in Explorer",
    internalCalls: "Internal calls",
    overview: "Overview",
    totalBalance: "Total balance",
    acrossAccounts: "Across 3 accounts",
    accountsLabel: "Accounts",
    cardsLabel: "Cards",
    recentActivity: "Recent activity",
    transferMoney: "Transfer money",
    checking: "Everyday account",
    savings: "Savings account",
    business: "Business account",
    availableBalance: "Available balance",
    active: "ACTIVE",
    blocked: "BLOCKED",
    expires: "Expires",
    blockCard: "Block card",
    cardBlocked: "Card blocked",
    blockCardTitle: "Block this card?",
    blockCardText:
      "The card will be disabled immediately and new transactions will be declined.",
    reason: "Reason",
    lost: "LOST",
    stolen: "STOLEN",
    suspectedFraud: "SUSPECTED_FRAUD",
    comment: "Comment",
    commentPlaceholder: "Add more information",
    cancel: "Cancel",
    confirmBlock: "Confirm block",
    fromAccount: "From account",
    recipientIban: "Recipient IBAN",
    amount: "Amount",
    transferNote: "Note",
    idempotencyKey: "Idempotency-Key",
    idempotencyHint: "This key prevents a duplicate transfer.",
    sendTransfer: "Send transfer",
    transferComplete: "Transfer sent successfully",
    today: "Today",
    cardPayment: "Card payment",
    salary: "Salary",
    exchangeTitle: "Currency converter",
    exchangeSubtitle: "Calculate with live sandbox rates.",
    youSend: "You send",
    youReceive: "You receive",
    swapCurrencies: "Swap currencies",
    exchangeRate: "Exchange rate",
    marketTrend: "7-day trend",
    updatedNow: "Updated just now",
    rateDisclaimer: "Mock rate for training purposes",
    high: "High",
    low: "Low",
    appNavigation: "App navigation",
    flightSearch: "Search flights",
    flightSearchSubtitle: "Find the right flight and test the booking flow.",
    from: "From",
    to: "To",
    departureDate: "Departure date",
    adults: "Adults",
    searchFlights: "Search flights",
    flightResults: "Available flights",
    flightsFound: "3 results",
    filters: "Filters",
    allFlights: "All flights",
    directOnly: "Direct only",
    oneStop: "1 stop",
    sortBy: "Sort by",
    recommended: "Recommended",
    lowestPrice: "Lowest price",
    shortestDuration: "Shortest duration",
    direct: "Direct",
    stop: "stop",
    duration: "Duration",
    perAdult: "per adult",
    selectFlight: "Select flight",
    bookingSummary: "Booking summary",
    passengerDetails: "Passenger details",
    fullName: "Full name",
    email: "Email",
    confirmBooking: "Confirm booking",
    bookingConfirmed: "Booking confirmed",
    hotelSearch: "Search hotels",
    hotelSearchSubtitle: "Find a room by city, dates, and number of guests.",
    city: "City",
    checkIn: "Check-in",
    checkOut: "Check-out",
    guests: "Guests",
    searchHotels: "Search hotels",
    hotelResults: "Available hotels",
    hotelsFound: "3 results",
    guestRating: "Guest rating",
    excellent: "Excellent",
    veryGood: "Very good",
    good: "Good",
    perNight: "per night",
    taxesIncluded: "Taxes included",
    reserveRoom: "Select room",
    amenities: "Amenities",
    freeWifi: "Free Wi-Fi",
    breakfast: "Breakfast",
    airportShuttle: "Airport shuttle",
    seaView: "Sea view",
    spa: "Spa",
    parking: "Parking",
    roomDetails: "Room details",
    standardRoom: "Standard room",
    roomUnavailable: "Room is no longer available",
    roomUnavailableText:
      "Another guest just booked this room. Refresh the results and choose an alternative.",
    refreshResults: "Refresh results",
    tryAnotherRoom: "Choose another room",
    searchBooks: "Search books",
    booksSubtitle: "Search the catalog by title or author.",
    allGenres: "All",
    fiction: "Fiction",
    technology: "Technology",
    businessGenre: "Business",
    science: "Science",
    byAuthor: "by",
    pages: "pages",
    writeReview: "Write a review",
    reviewTitle: "Add a review",
    yourRating: "Your rating",
    yourReview: "Your review",
    reviewPlaceholder: "Share your thoughts about this book...",
    publishReview: "Publish review",
    reviewPublished: "Review published",
    searchMusic: "Search tracks, artists, or albums",
    tracks: "Tracks",
    playlists: "Playlists",
    song: "Track",
    artist: "Artist",
    album: "Album",
    length: "Duration",
    playTrack: "Play track",
    pauseTrack: "Pause track",
    nowPlaying: "Now playing",
    showVideo: "Show YouTube preview",
    hideVideo: "Hide YouTube preview",
    songs: "tracks",
    customerDirectory: "Customer directory",
    customerSubtitle: "Create and manage customer profiles.",
    createCustomer: "Create customer",
    editCustomer: "Edit customer",
    deleteCustomer: "Delete customer",
    company: "Company",
    created: "Created",
    actions: "Actions",
    saveCustomer: "Save customer",
    updateMethod: "Update method",
    putDescription: "PUT replaces the entire customer resource.",
    patchDescription: "PATCH updates only the changed fields.",
    deleteCustomerTitle: "Delete customer?",
    deleteCustomerText:
      "This will permanently delete the customer profile and cannot be undone.",
    confirmDelete: "Confirm delete",
    customerCreated: "Customer created",
    customerUpdated: "Customer updated",
    googleConsent: "Continue with Google",
    googleConsentSubtitle:
      "Follow a mock OAuth flow to sign in to your API Lab account.",
    oauthFlow: "OAuth flow",
    authorizationRequest: "Authorization request",
    userConsent: "User consent",
    authorizationCode: "Authorization code",
    tokenExchange: "Token exchange",
    consentTitle: "API Lab wants access to your information",
    consentAccount: "Signed-in account",
    consentPermissions: "API Lab will be able to:",
    viewProfile: "View your name and profile picture",
    viewEmail: "View your email address",
    allow: "Allow",
    deny: "Deny",
    continueFlow: "Continue to next step",
    restartFlow: "Restart flow",
    oauthComplete: "OAuth flow complete",
    oauthCompleteText: "The access token was obtained securely.",
    currentStep: "Current step",
    total: "Total",
    authLabTitle: "Auth Lab",
    authLabSubtitle:
      "Practice login, JWT, and OAuth 2.0 flows in a safe sandbox.",
    login: "Login",
    loginDescription: "Sign in with a demo account and receive an access token.",
    signIn: "Sign in",
    signingIn: "Signing in",
    loginSuccess: "Login successful",
    accessTokenReady: "Access token is ready",
    jwtDecoder: "JWT decoder",
    jwtDescription: "Read the token's three parts and inspect its payload.",
    pasteJwt: "Paste JWT",
    decode: "Decode",
    jwtHeader: "Header",
    jwtPayload: "Payload",
    jwtSignature: "Signature",
    issuedAt: "Issued at",
    expiresAt: "Expires at",
    refresh: "Refresh",
    tokenRefreshed: "Token refreshed",
    oauthSequence: "OAuth 2.0 Authorization Code",
    oauthSequenceSubtitle: "Follow each step of the Authorization Code flow.",
    startAnimation: "Start flow",
    replayAnimation: "Replay flow",
    browser: "Browser",
    authorizationServer: "Authorization server",
    apiServer: "API server",
    redirectToLogin: "Redirect to login",
    returnCode: "Return authorization code",
    exchangeCode: "Exchange code for token",
    callApi: "Call API with Bearer token",
    sqlPlayground: "SQL Playground",
    sqlSubtitle: "Write safe SELECT queries against the training database.",
    selectOnly: "SELECT only",
    selectOnlyNotice:
      "Only SELECT queries are allowed to keep training data safe.",
    schemaTree: "Schema",
    tables: "Tables",
    columns: "Columns",
    sqlEditor: "SQL editor",
    runQuery: "Run query",
    runningQuery: "Running query",
    formatQuery: "Format query",
    quickQueries: "Quick queries",
    allUsers: "All users",
    activeCards: "Active cards",
    recentBookings: "Recent bookings",
    queryResults: "Query results",
    rowsReturned: "rows returned",
    queryTime: "Query time",
    sqlEmptyTitle: "Ready to run a query",
    sqlEmptyText: "Results will appear here as a table.",
    sqlError: "Only SELECT queries are allowed",
    materialsTitle: "Learning materials",
    materialsSubtitle:
      "Review lessons, complete practical tasks, and download course files.",
    courseProgress: "Course progress",
    completedTasks: "tasks completed",
    lessonMaterials: "Lesson materials",
    practicalTasks: "Practical tasks",
    markComplete: "Mark as complete",
    openInExplorerTask: "Open in Explorer",
    checkWithSql: "Check with SQL",
    taskSendRequest: "Send a request to the GET /users endpoint",
    taskInspectHeaders: "Inspect response headers and status code",
    taskRefreshToken: "Refresh an expired token",
    taskSqlUsers: "Find active users with SQL",
    taskIdempotency: "Create a transfer with Idempotency-Key",
    downloads: "Downloads",
    downloadsSubtitle: "Files for offline review and practice.",
    presentation: "Course presentation",
    workbook: "Student workbook",
    postmanCollection: "Postman collection",
    pptxFile: "PPTX file",
    pdfFile: "PDF file",
    jsonFile: "JSON collection",
    download: "Download",
    lessonIntro: "API fundamentals",
    lessonHttp: "HTTP, REST, and status codes",
    lessonAuth: "Auth, JWT, and OAuth",
    lessonData: "SQL and data validation",
    authenticationSandbox: "AUTHENTICATION SANDBOX",
    sequenceDiagram: "SEQUENCE DIAGRAM",
    dataLab: "DATA LAB",
    learningHub: "LEARNING HUB",
    fourLessons: "4 LESSONS",
    signInToContinue: "Sign in to continue",
    signInHeroTitle: "Sign in to start calling real APIs",
    signInHeroSubtitle:
      "Send real requests, verify data with SQL, and learn Auth flows in a safe environment.",
    benefitEndpoints: "Real endpoints and SQL-checkable data",
    benefitSandbox: "Safe training sandbox",
    benefitTools: "Works with Postman and curl",
    howItWorks:
      "Sign-in uses OAuth 2.0 Authorization Code flow, the same flow you learn in Lesson 3.",
    welcomeBack: "Welcome back",
    continueWithGoogle: "Continue with Google",
    orLabel: "or",
    demoAccountsHelper: "Demo accounts for the training sandbox",
    privacyNote:
      "We only use your name and email to create your sandbox profile. No data leaves the training environment.",
    profile: "Profile",
    tokenInfo: "Token info",
    signOut: "Sign out",
    expiresIn: "Expires in",
    sessionExpired: "Token expired, refresh it",
    refreshSession: "Refresh",
    redirectAuthServer: "Redirect to Auth Server",
    chooseAccount: "Choose account",
    consent: "Consent",
    tokenExchangeStep: "Token exchange",
    useAnotherAccount: "Use another account",
    googleAccessTitle: "API Lab wants to access your Google Account",
    permissionIdentity: "View your name and email",
    permissionSandbox: "Create a sandbox profile",
    mockGoogleNotice:
      "Mock Google screen for training. No real Google data is used.",
    accessDenied: "Access denied",
    accessDeniedText: "Consent was cancelled. No data was shared.",
    tryAgain: "Try again",
    loadFailed: "Could not load data",
    deleteFailed: "Delete failed",
    prevPage: "Previous",
    nextPage: "Next",
    pageOf: "page",
    invalidCode: "Invalid or expired code",
    invalidCodeText: "The Authorization Code or state verification failed.",
    exchangingCode: "Exchanging code for token...",
    codeReceived: "Authorization code received",
    stateVerified: "state verified",
    accessTokenIssued: "access token issued",
    signedInAs: "Signed in as",
    showHttpCalls: "Show the HTTP calls",
    hideHttpCalls: "Hide the HTTP calls",
    oauthRequests: "OAuth requests",
    wrongCredentials: "Wrong username or password",
    tooManyAttempts: "Too many attempts",
    retryAfter: "Try again in",
    authErrorCode: "Error code",
    authTraceId: "traceId",
    anotherAccountUnavailable:
      "Only the listed training accounts are available in this mock flow.",
  },
} as const;

type Translation = (typeof translations)[Language];

function Icon({
  name,
  size = 20,
}: {
  name:
    | "arrow"
    | "bank"
    | "book"
    | "card"
    | "chart"
    | "check"
    | "chevron"
    | "clipboard"
    | "close"
    | "code"
    | "compass"
    | "edit"
    | "globe"
    | "lock"
    | "menu"
    | "moon"
    | "music"
    | "network"
    | "plane"
    | "play"
    | "plus"
    | "pause"
    | "repeat"
    | "search"
    | "star"
    | "sun"
    | "trash"
    | "users";
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    bank: (
      <>
        <path d="m3 10 9-6 9 6" />
        <path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18" />
      </>
    ),
    book: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      </>
    ),
    card: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20M6 15h4" />
      </>
    ),
    chart: (
      <>
        <path d="M3 3v18h18" />
        <path d="m7 15 4-4 3 2 5-6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    clipboard: (
      <>
        <rect width="14" height="14" x="8" y="8" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    close: (
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>
    ),
    code: (
      <>
        <path d="m8 9-3 3 3 3" />
        <path d="m16 9 3 3-3 3" />
        <path d="m14 5-4 14" />
      </>
    ),
    compass: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20" />
      </>
    ),
    lock: (
      <>
        <rect width="18" height="11" x="3" y="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
    menu: (
      <>
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h16" />
      </>
    ),
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />,
    music: (
      <>
        <path d="M9 18V5l11-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="17" cy="16" r="3" />
      </>
    ),
    network: (
      <>
        <rect x="9" y="2" width="6" height="6" rx="1" />
        <rect x="2" y="16" width="6" height="6" rx="1" />
        <rect x="16" y="16" width="6" height="6" rx="1" />
        <path d="M12 8v4M5 16v-4h14v4" />
      </>
    ),
    plane: <path d="M22 2 9 15M22 2l-7 20-4-9-9-4 20-7Z" />,
    play: <path d="m7 4 13 8-13 8V4Z" />,
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    pause: (
      <>
        <path d="M8 5v14" />
        <path d="M16 5v14" />
      </>
    ),
    repeat: (
      <>
        <path d="m17 1 4 4-4 4" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    star: <path d="m12 2.7 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.4 6.3-.9L12 2.7Z" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {paths[name]}
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="google-g-mark" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.42l-3.24-2.53c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.88A6.01 6.01 0 0 1 6.08 12c0-.65.11-1.28.31-1.88V7.51H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.49l3.35-2.61Z" />
      <path fill="#EA4335" d="M12 5.99c1.47 0 2.79.51 3.83 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.61C7.18 7.75 9.39 5.99 12 5.99Z" />
    </svg>
  );
}

function CopyButton({
  value,
  label,
  copiedLabel,
  compact = false,
}: {
  value: string;
  label: string;
  copiedLabel: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      className={compact ? "copy-button copy-button--compact" : "copy-button"}
      onClick={copy}
      type="button"
      aria-label={label}
    >
      <Icon name={copied ? "check" : "clipboard"} size={17} />
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}

function Header({
  language,
  setLanguage,
  theme,
  setTheme,
  currentPage,
  session,
  onNavigate,
  onSignOut,
  t,
}: {
  language: Language;
  setLanguage: (language: Language) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  currentPage: Page;
  session: AuthSession | null;
  onNavigate: (page: Page) => void;
  onSignOut: () => void;
  t: Translation;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const navItems: { label: string; page?: Page }[] = [
    { label: t.home, page: "home" },
    { label: t.explorer, page: "explorer" },
    { label: t.apps, page: "apps" },
    { label: t.authLab, page: "auth" },
    { label: t.sql, page: "sql" },
    { label: t.materials, page: "materials" },
  ];

  useEffect(() => {
    if (!session) {
      setRemainingSeconds(0);
      return;
    }
    const update = () =>
      setRemainingSeconds(
        Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)),
      );
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [session]);

  const navigate = (page?: Page) => {
    if (!page) return;
    onNavigate(page);
    setMenuOpen(false);
    setUserMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const countdown = `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`;

  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="/" aria-label="API Lab Home" onClick={(event) => { event.preventDefault(); navigate("home"); }}>
          <span className="brand-mark">
            <Icon name="code" size={21} />
          </span>
          <span>API Lab</span>
          <span className="brand-badge">{t.beta}</span>
        </a>

        <nav className="desktop-nav" aria-label={t.navLabel}>
          {navItems.map((item) => (
            <a
              className={item.page === currentPage ? "nav-link active" : "nav-link"}
              href={item.page ? pathOf(item.page) : "/"}
              key={item.label}
              onClick={(event) => {
                if (item.page) event.preventDefault();
                navigate(item.page);
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <div className="language-switcher" role="group" aria-label={t.language}>
            {(["az", "en"] as const).map((item) => (
              <button
                className={language === item ? "language-option active" : "language-option"}
                key={item}
                onClick={() => setLanguage(item)}
                type="button"
                aria-pressed={language === item}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            className="icon-button theme-button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            type="button"
            aria-label={theme === "light" ? t.themeToDark : t.themeToLight}
          >
            <Icon name={theme === "light" ? "moon" : "sun"} />
          </button>
          {session ? (
            <div
              className="user-menu-wrap"
              onKeyDown={(event) => {
                if (event.key === "Escape") setUserMenuOpen(false);
              }}
            >
              <button
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                className="user-chip"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                type="button"
              >
                <span className="avatar">{session.user.initials}</span>
                <span className="user-name">{session.user.name.split(" ")[0]}</span>
                <span className="presence-dot" />
              </button>
              {userMenuOpen && (
                <div className="user-dropdown" role="menu">
                  <div className="user-profile-block">
                    <span className="avatar">{session.user.initials}</span>
                    <div>
                      <small>{t.profile}</small>
                      <strong>{session.user.name}</strong>
                      <span>{session.user.email}</span>
                      <code>
                        {session.user.role === "admin" ? t.administrator : t.student}
                      </code>
                    </div>
                  </div>
                  <div className="token-info-block">
                    <span>{t.tokenInfo}</span>
                    <div>
                      <code>access token</code>
                      <strong>{t.expiresIn} {countdown}</strong>
                    </div>
                  </div>
                  <button
                    className="signout-button"
                    onClick={onSignOut}
                    role="menuitem"
                    type="button"
                  >
                    <Icon name="arrow" size={16} />
                    {t.signOut}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              className="header-signin-button"
              onClick={() => navigate("signin")}
              type="button"
            >
              <Icon name="lock" size={16} />
              {t.signIn}
            </button>
          )}
          <button
            className="icon-button menu-button"
            onClick={() => setMenuOpen(!menuOpen)}
            type="button"
            aria-label={menuOpen ? t.closeMenu : t.openMenu}
            aria-expanded={menuOpen}
          >
            <Icon name={menuOpen ? "close" : "menu"} />
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav className="mobile-nav" aria-label={t.navLabel}>
          {navItems.map((item) => (
            <a
              className={item.page === currentPage ? "mobile-nav-link active" : "mobile-nav-link"}
              href={item.page ? pathOf(item.page) : "/"}
              key={item.label}
              onClick={(event) => {
                if (item.page) event.preventDefault();
                navigate(item.page);
              }}
            >
              {item.label}
              <Icon name="chevron" size={18} />
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}

const lessonIcons = ["play", "compass", "lock"] as const;
const lessonMethods = ["GET", "POST", "JWT"] as const;

type RequestTab = "params" | "headers" | "auth" | "body" | "tests";
type ResponseTab = "pretty" | "raw" | "headers" | "tests";
type ExplorerPanel = "endpoints" | "request" | "response";

type HistoryItem = {
  id: number;
  method: string;
  url: string;
  status: number;
  time: number;
  createdAt: string;
};

type KeyValueRow = { key: string; value: string; description: string };

const formatClock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const toBase64 = (value: string) => btoa(String.fromCharCode(...new TextEncoder().encode(value)));

// Modal fonu: kənara klik və Escape bağlayır (QA-M05); açılanda fokus dialoqa keçir, bağlananda əvvəlki elementə qayıdır
function ModalBackdrop({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])");
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={() => closeRef.current()} ref={ref} role="presentation">
      {children}
    </div>
  );
}

function StatusChip({ status }: { status: number }) {
  return (
    <span className={`explorer-status status-${Math.floor(status / 100)}xx`}>
      {status}
    </span>
  );
}

function ExplorerPage({ t }: { t: Translation }) {
  const baseUrl = `${window.location.origin}`;
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState(`${baseUrl}/api/v1/health`);
  const [requestTab, setRequestTab] = useState<RequestTab>("params");
  const [responseTab, setResponseTab] = useState<ResponseTab>("pretty");
  const [mobilePanel, setMobilePanel] = useState<ExplorerPanel>("request");
  const [authType, setAuthType] = useState("bearer");
  const [authValue, setAuthValue] = useState("");
  const [params, setParams] = useState<KeyValueRow[]>([{ key: "", value: "", description: "" }]);
  const [headers, setHeaders] = useState<KeyValueRow[]>([{ key: "Accept", value: "application/json", description: "" }]);
  const [body, setBody] = useState("");
  const [response, setResponse] = useState<ExplorerResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyClearedAt, setHistoryClearedAt] = useState(0);
  const [groups, setGroups] = useState<EndpointGroup[]>([]);
  const [testsScript, setTestsScript] = useState(SAMPLE_TESTS);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);

  // Endpoint kitabxanası OpenAPI spec-dən
  useEffect(() => {
    apiClient.getEndpointGroups().then(setGroups).catch(() => setGroups([]));
    const pending = handoffs.take().explorer;
    if (pending) {
      setMethod(pending.method);
      setUrl(`${baseUrl}${pending.path}`);
    }
  }, [baseUrl]);

  // History — serverdəki request_log (GET /api/v1/_history)
  const loadHistory = async () => {
    try {
      const items = await apiClient.getHistory(20);
      setHistory(
        items
          .filter((item) => item.id > historyClearedAt)
          .map((item) => ({ id: item.id, method: item.method, url: item.path, status: item.status, time: item.durationMs, createdAt: item.createdAt })),
      );
    } catch {
      // History yalnız token ilə — xəta UI-ı bloklamır
    }
  };

  useEffect(() => {
    void loadHistory();
  }, [historyClearedAt]);

  const endpointCount = groups.reduce((n, group) => n + group.endpoints.length, 0);
  const filteredGroups = groups
    .map((group) => ({
      ...group,
      endpoints: group.endpoints.filter((endpoint) =>
        `${endpoint.method} ${endpoint.path} ${endpoint.label}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    }))
    .filter((group) => group.endpoints.length > 0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(
      () => setCountdown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [countdown]);

  const selectEndpoint = (nextMethod: string, path: string, exampleBody?: string) => {
    setMethod(nextMethod);
    setUrl(`${baseUrl}${path}`);
    setBody(exampleBody ?? "");
    setResponse(null);
    setMobilePanel("request");
    if (exampleBody) setRequestTab("body");
  };

  // Params → URL query, Headers + Auth → request headers
  const buildRequest = () => {
    const target = new URL(url, baseUrl);
    params.filter((row) => row.key.trim()).forEach((row) => target.searchParams.set(row.key.trim(), row.value));
    const requestHeaders: Record<string, string> = {};
    headers.filter((row) => row.key.trim()).forEach((row) => (requestHeaders[row.key.trim()] = row.value));
    const sendsBody = body.trim() !== "" && !["GET", "HEAD"].includes(method);
    if (sendsBody && !Object.keys(requestHeaders).some((key) => key.toLowerCase() === "content-type")) {
      requestHeaders["Content-Type"] = "application/json";
    }
    if (authType === "bearer") {
      const token = authValue.trim() || authClient.getStoredSession()?.accessToken;
      if (token) requestHeaders.Authorization = `Bearer ${token}`;
    } else if (authType === "api-key" && authValue.trim()) {
      requestHeaders["X-API-Key"] = authValue.trim();
    } else if (authType === "basic" && authValue.includes(":")) {
      requestHeaders.Authorization = `Basic ${toBase64(authValue)}`;
    }
    return { url: target.toString(), headers: requestHeaders, body: sendsBody ? body : undefined };
  };

  const sendRequest = async () => {
    setIsLoading(true);
    setResponse(null);
    setMobilePanel("response");
    const built = buildRequest();
    const result = await apiClient.sendExplorerRequest({ method, ...built });
    setResponse(result);
    // Tests tab-ındakı assertion-lar real cavab üzərində icra olunur
    setTestResults(runTests(testsScript, { status: result.status, headers: result.headers, body: result.body, time: result.time }));
    setIsLoading(false);
    setCountdown(result.retryAfter ?? 0);
    await loadHistory();
  };

  const built = buildRequest();
  const curl = [
    `curl -X ${method} "${built.url}"`,
    ...Object.entries(built.headers).map(([key, value]) => `-H "${key}: ${value}"`),
    ...(built.body ? [`-d '${built.body.replace(/'/g, "'\\''")}'`] : []),
  ].join(" \\\n  ");
  const requestTabs: { id: RequestTab; label: string }[] = [
    { id: "params", label: t.params },
    { id: "headers", label: t.headers },
    { id: "auth", label: t.auth },
    { id: "body", label: t.body },
    { id: "tests", label: t.tests },
  ];
  const passedTests = testResults?.filter((r) => r.pass).length ?? 0;
  const responseTabs: { id: ResponseTab; label: string }[] = [
    { id: "pretty", label: t.pretty },
    { id: "raw", label: t.raw },
    { id: "headers", label: t.headers },
    { id: "tests", label: testResults?.length ? `${t.tests} ${passedTests}/${testResults.length}` : t.tests },
  ];
  const rows = requestTab === "params" ? params : headers;
  const setRows = requestTab === "params" ? setParams : setHeaders;
  const updateRow = (index: number, field: keyof KeyValueRow, value: string) =>
    setRows((items) => items.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  const bodyText = (value: unknown, pretty: boolean) =>
    typeof value === "string" ? value : JSON.stringify(value, null, pretty ? 2 : undefined) ?? "";
  const errorMessage = (value: unknown) =>
    value && typeof value === "object" ? String((value as Record<string, unknown>).message ?? (value as Record<string, unknown>).error_description ?? "") : String(value ?? "");

  return (
    <main className="explorer-page" id="main-content">
      <div className="explorer-titlebar">
        <div>
          <span className="section-kicker">
            <Icon name="compass" size={16} />
            {t.sandbox}
          </span>
          <h1>{t.explorerTitle}</h1>
          <p>{t.explorerSubtitle}</p>
        </div>
        <div className="environment-chip">
          <i />
          <span>{t.environment}</span>
          <code>v1</code>
        </div>
      </div>

      <div className="explorer-mobile-tabs" role="tablist" aria-label={t.explorerTitle}>
        {([
          ["endpoints", t.endpointsPanel],
          ["request", t.requestPanel],
          ["response", t.responsePanel],
        ] as const).map(([id, label]) => (
          <button
            aria-selected={mobilePanel === id}
            className={mobilePanel === id ? "active" : ""}
            key={id}
            onClick={() => setMobilePanel(id)}
            role="tab"
            type="button"
          >
            {label}
            {id === "response" && response && <StatusChip status={response.status} />}
          </button>
        ))}
      </div>

      {response?.status === 429 && countdown > 0 && (
        <div className="retry-banner" role="status">
          <div className="retry-icon">429</div>
          <div>
            <strong>{t.retryTitle}</strong>
            <span>{t.retryText}</span>
          </div>
          <div className="retry-countdown">
            <strong>{countdown}</strong>
            <span>{t.seconds}</span>
          </div>
        </div>
      )}

      <div className="explorer-workspace">
        <aside className={`endpoint-sidebar explorer-column panel-${mobilePanel}`}>
          <div className="panel-heading">
            <div>
              <span>{t.endpointLibrary}</span>
              <small>{endpointCount} ENDPOINTS</small>
            </div>
          </div>
          <label className="endpoint-search">
            <Icon name="search" size={17} />
            <span className="sr-only">{t.searchEndpoints}</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t.searchEndpoints}
              type="search"
              value={search}
            />
          </label>
          <div className="endpoint-tree">
            {filteredGroups.length === 0 ? (
              <div className="tree-empty">{groups.length === 0 ? t.loading : t.noEndpoints}</div>
            ) : (
              filteredGroups.map((group) => (
                <div className="endpoint-group" key={group.label}>
                  <div className="endpoint-group-title">
                    <Icon name="chevron" size={14} />
                    <span>{group.label}</span>
                    <small>{group.endpoints.length}</small>
                  </div>
                  {group.endpoints.map((endpoint) => {
                    const active = method === endpoint.method && url === `${baseUrl}${endpoint.path}`;
                    return (
                      <button
                        className={active ? "endpoint-item active" : "endpoint-item"}
                        key={`${endpoint.method}-${endpoint.path}`}
                        onClick={() => selectEndpoint(endpoint.method, endpoint.path, endpoint.body)}
                        type="button"
                      >
                        <span className={`mini-method method-${endpoint.method.toLowerCase()}`}>
                          {endpoint.method}
                        </span>
                        <span>
                          <strong>{endpoint.label}</strong>
                          <code>{endpoint.path}</code>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </aside>

        <section className={`request-builder explorer-column panel-${mobilePanel}`} aria-label={t.requestBuilder}>
          <div className="panel-heading">
            <div>
              <span>{t.requestBuilder}</span>
              <small>{t.requestDetails}</small>
            </div>
            <span className="draft-chip">DRAFT</span>
          </div>
          <div className="request-url-row">
            <label>
              <span className="sr-only">{t.method}</span>
              <select value={method} onChange={(event) => setMethod(event.target.value)}>
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
                <option>PATCH</option>
                <option>DELETE</option>
                <option>HEAD</option>
                <option>OPTIONS</option>
              </select>
            </label>
            <label className="request-url-input">
              <span className="sr-only">{t.requestUrl}</span>
              <input value={url} onChange={(event) => setUrl(event.target.value)} />
            </label>
            <button
              className="explorer-send"
              disabled={isLoading || countdown > 0}
              onClick={sendRequest}
              type="button"
            >
              {isLoading ? <span className="button-spinner" /> : <Icon name="play" size={16} />}
              {t.send}
            </button>
          </div>

          <div className="builder-tabs" role="tablist">
            {requestTabs.map((tab) => (
              <button
                aria-selected={requestTab === tab.id}
                className={requestTab === tab.id ? "active" : ""}
                key={tab.id}
                onClick={() => setRequestTab(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
                {(tab.id === "params" || tab.id === "headers") && (
                  <span>{(tab.id === "params" ? params : headers).filter((row) => row.key.trim()).length}</span>
                )}
              </button>
            ))}
          </div>

          <div className="builder-content">
            {(requestTab === "params" || requestTab === "headers") && (
              <div className="key-value-editor">
                <div className="kv-head">
                  <span>{t.key}</span>
                  <span>{t.value}</span>
                  <span>{t.description}</span>
                </div>
                {rows.map((row, index) => (
                  <div className="kv-row" key={index}>
                    <input aria-label={t.key} onChange={(event) => updateRow(index, "key", event.target.value)} placeholder={requestTab === "params" ? "page" : "X-Request-Id"} value={row.key} />
                    <input aria-label={t.value} onChange={(event) => updateRow(index, "value", event.target.value)} placeholder={requestTab === "params" ? "1" : "my-trace-1"} value={row.value} />
                    <input aria-label={t.description} onChange={(event) => updateRow(index, "description", event.target.value)} placeholder="—" value={row.description} />
                  </div>
                ))}
                <button className="add-row-button" onClick={() => setRows((items) => [...items, { key: "", value: "", description: "" }])} type="button">
                  <span>+</span>
                  {requestTab === "params" ? t.addParameter : t.addHeader}
                </button>
              </div>
            )}

            {requestTab === "auth" && (
              <div className="auth-editor">
                <label>
                  <span>{t.authType}</span>
                  <select value={authType} onChange={(event) => setAuthType(event.target.value)}>
                    <option value="none">{t.none}</option>
                    <option value="bearer">Bearer</option>
                    <option value="api-key">{t.apiKey}</option>
                    <option value="basic">{t.basic}</option>
                  </select>
                </label>
                {authType !== "none" && (
                  <label>
                    <span>{authType === "bearer" ? t.bearerToken : t.value}</span>
                    <input
                      onChange={(event) => setAuthValue(event.target.value)}
                      placeholder={authType === "bearer" ? t.tokenPlaceholder : authType === "api-key" ? "apilab-demo-key-2026" : "student:student123"}
                      type={authType === "basic" ? "password" : "text"}
                      value={authValue}
                    />
                  </label>
                )}
              </div>
            )}

            {requestTab === "body" && (
              <div className="code-editor">
                <div className="editor-toolbar">
                  <span>{t.bodyJsonHint}</span>
                  <code>application/json</code>
                </div>
                <textarea
                  aria-label={t.bodyJsonHint}
                  onChange={(event) => setBody(event.target.value)}
                  spellCheck="false"
                  value={body}
                />
              </div>
            )}

            {requestTab === "tests" && (
              <div className="code-editor">
                <div className="editor-toolbar"><span>{t.testsHint}</span></div>
                <textarea
                  aria-label={t.tests}
                  onChange={(event) => setTestsScript(event.target.value)}
                  placeholder={t.testsHelp}
                  spellCheck="false"
                  value={testsScript}
                />
              </div>
            )}
          </div>
        </section>

        <aside className={`response-panel explorer-column panel-${mobilePanel}`}>
          <div className="panel-heading response-panel-heading">
            <div>
              <span>{t.response}</span>
              {response && (
                <small>
                  {response.time} ms · {response.size}
                </small>
              )}
            </div>
            {response && <StatusChip status={response.status} />}
          </div>

          {isLoading ? (
            <div className="response-loading" aria-label={t.sendingRequest}>
              <div className="skeleton skeleton-short" />
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton skeleton-medium" />
              <div className="skeleton" />
            </div>
          ) : !response ? (
            <div className="response-empty">
              <div className="empty-icon"><Icon name="code" size={26} /></div>
              <h3>{t.responseEmptyTitle}</h3>
              <p>{t.responseEmptyText}</p>
            </div>
          ) : response.errorCode && responseTab === "pretty" ? (
            <div className="response-error">
              <div className="error-mark">!</div>
              <h3>{t.errorTitle}</h3>
              <p>{errorMessage(response.body)}</p>
              <dl>
                <div><dt>{t.errorCode}</dt><dd>{response.errorCode}</dd></div>
                <div><dt>{t.traceId}</dt><dd>{response.traceId ?? "—"}</dd></div>
              </dl>
              <div className="response-tabs" role="tablist">
                {responseTabs.slice(1).map((tab) => (
                  <button key={tab.id} onClick={() => setResponseTab(tab.id)} role="tab" type="button">{tab.label}</button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="response-toolbar">
                <div className="response-tabs" role="tablist">
                  {responseTabs.map((tab) => (
                    <button
                      aria-selected={responseTab === tab.id}
                      className={responseTab === tab.id ? "active" : ""}
                      key={tab.id}
                      onClick={() => setResponseTab(tab.id)}
                      role="tab"
                      type="button"
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <CopyButton value={curl} label={t.copyAsCurl} copiedLabel={t.copied} compact />
              </div>
              {responseTab === "tests" ? (
                <ul className="test-results" aria-label={t.tests}>
                  {!testResults?.length ? (
                    <li className="test-empty">{t.testsNone}</li>
                  ) : (
                    testResults.map((result, index) => (
                      <li className={result.pass ? "pass" : "fail"} key={index}>
                        <span className="test-mark">{result.pass ? "PASS" : "FAIL"}</span>
                        <code>{result.name}</code>
                        <small>{result.message}</small>
                      </li>
                    ))
                  )}
                </ul>
              ) : (
              <pre className="response-code">
                {responseTab === "headers"
                  ? [`HTTP ${response.status} ${response.statusText}`, ...Object.entries(response.headers).map(([key, value]) => `${key}: ${value}`)].join("\n")
                  : bodyText(response.body, responseTab === "pretty")}
              </pre>
              )}
            </>
          )}
        </aside>
      </div>

      <section className="history-section" aria-labelledby="history-title">
        <div className="history-heading">
          <div>
            <h2 id="history-title">{t.history}</h2>
            <p>{t.historySubtitle}</p>
          </div>
          {history.length > 0 && (
            <button onClick={() => setHistoryClearedAt(history[0].id)} type="button">{t.clearHistory}</button>
          )}
        </div>
        <div className="history-card">
          {history.length === 0 ? (
            <div className="history-empty">{t.noHistory}</div>
          ) : (
            <div aria-label={t.history} className="table-scroll" role="region" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th>{t.method}</th>
                    <th>{t.endpoint}</th>
                    <th>{t.status}</th>
                    <th>{t.time}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td><span className={`mini-method method-${item.method.toLowerCase()}`}>{item.method}</span></td>
                      <td><code>{item.url}</code></td>
                      <td><StatusChip status={item.status} /></td>
                      <td><span className="history-time">{item.time} ms · {formatClock(item.createdAt)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}


function NetworkPanel({
  calls,
  open,
  setOpen,
  onOpenExplorer,
  t,
}: {
  calls: NetworkCall[];
  open: boolean;
  setOpen: (open: boolean) => void;
  onOpenExplorer: () => void;
  t: Translation;
}) {
  const [expanded, setExpanded] = useState<string[]>([]);

  return (
    <aside className={open ? "network-panel open" : "network-panel"}>
      <button
        className="network-toggle"
        onClick={() => setOpen(!open)}
        type="button"
        aria-label={open ? t.collapseNetwork : t.expandNetwork}
      >
        <Icon name={open ? "chevron" : "network"} size={18} />
      </button>
      {open && (
        <>
          <div className="network-head">
            <div>
              <span className="network-live-dot" />
              <div>
                <strong>{t.network}</strong>
                <small>{t.networkSubtitle}</small>
              </div>
            </div>
            <span className="network-count">{calls.length}</span>
          </div>
          <div className="network-calls">
            {calls.length === 0 ? (
              <div className="network-empty">
                <Icon name="network" size={25} />
                <span>{t.noNetworkCalls}</span>
              </div>
            ) : (
              calls.map((call) => {
                const isExpanded = expanded.includes(call.id);
                return (
                  <div className="network-call" key={call.id}>
                    <button
                      className="network-call-main"
                      onClick={() => {
                        if (!call.internalCalls) return;
                        setExpanded((items) =>
                          isExpanded
                            ? items.filter((id) => id !== call.id)
                            : [...items, call.id],
                        );
                      }}
                      type="button"
                    >
                      <span className={`mini-method method-${call.method.toLowerCase()}`}>
                        {call.method}
                      </span>
                      <span className="network-url">
                        <code>{call.url}</code>
                        <small>
                          <StatusChip status={call.status} />
                          <span>{call.time} ms</span>
                          {call.type && <b>{call.type}</b>}
                        </small>
                      </span>
                      {call.internalCalls && (
                        <Icon name="chevron" size={14} />
                      )}
                    </button>
                    {isExpanded && call.internalCalls && (
                      <div className="internal-calls">
                        <span>{t.internalCalls}</span>
                        {call.internalCalls.map((internal) => (
                          <div key={internal.id}>
                            <span className={`mini-method method-${internal.method.toLowerCase()}`}>
                              {internal.method}
                            </span>
                            <code>{internal.url}</code>
                            <StatusChip status={internal.status} />
                            <small>{internal.time} ms</small>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <div className="network-footer">
            <button onClick={onOpenExplorer} type="button">
              <Icon name="compass" size={16} />
              {t.openInExplorer}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

// Pul formatı: AZN → ₼, USD → $, EUR → €
const CURRENCY_SYMBOL: Record<string, string> = { AZN: "₼", USD: "$", EUR: "€", GBP: "£", TRY: "₺" };
const money = (amount: number, currencyCode: string) =>
  `${CURRENCY_SYMBOL[currencyCode] ?? currencyCode} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateShort = (iso: string) => new Date(iso).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });

// Xəta mesajı UI üçün: "422 INSUFFICIENT_FUNDS — Hesabda kifayət qədər vəsait yoxdur"
const errorText = (error: unknown) =>
  error instanceof AuthClientError ? `${error.status} ${error.code} — ${error.message}` : String((error as Error)?.message ?? error);

// Ortaq xəta halı (QA-M06/M07/M08): boş və ya yanlış data əvəzinə kod + mesaj + "Yenidən cəhd et"
function LoadError({ error, onRetry, t }: { error: string; onRetry: () => void; t: Translation }) {
  return (
    <div className="load-error" role="alert">
      <Icon name="network" size={18} />
      <div>
        <strong>{t.loadFailed}</strong>
        <code>{error}</code>
      </div>
      <button onClick={onRetry} type="button">{t.tryAgain}</button>
    </div>
  );
}

function BankApp({ t }: { t: Translation }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loadError, setLoadError] = useState("");
  const [blockCardId, setBlockCardId] = useState<number | null>(null);
  const [blockReason, setBlockReason] = useState("LOST");
  const [blockComment, setBlockComment] = useState("");
  const [blockError, setBlockError] = useState("");
  // Idempotency-Key bir "niyyətə" bağlıdır: eyni kart + səbəb + şərh üçün təkrar cəhdlər (ikiqat klik, şəbəkə xətası) eyni açarla
  // gedir → server saxlanmış cavabı qaytarır (409 yox). Sorğu dəyişəndə yeni açar (əks halda 422 IDEMPOTENCY_KEY_REUSED).
  const [blockKey, setBlockKey] = useState(() => bank.newIdempotencyKey());
  const [blockPending, setBlockPending] = useState(false);
  const [transferPending, setTransferPending] = useState(false);
  const [transferSent, setTransferSent] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [recipient, setRecipient] = useState("AZ21NABZ0004");
  const [amount, setAmount] = useState("25.00");
  const [idempotencyKey, setIdempotencyKey] = useState(() => bank.newIdempotencyKey());
  const [history, setHistory] = useState<Transaction[]>([]);

  const load = async () => {
    try {
      const next = await bank.dashboard(); // BFF: accounts + cards + transactions + rates (1 sorğu)
      setData(next);
      const primary = next.accounts.find((a) => a.currency === "AZN") ?? next.accounts[0];
      if (primary) bank.transactions(primary.id).then(setHistory).catch(() => setHistory([]));
      setFromAccount((current) => current || next.accounts[0]?.id || "");
      setLoadError("");
    } catch (error) {
      setLoadError(errorText(error));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // Ümumi balans AZN ilə: 1 AZN = rate X → X / rate
  const totalAzn = data
    ? data.accounts.reduce((sum, account) => {
        const rate = account.currency === "AZN" ? 1 : data.rates.rates[account.currency];
        return sum + (rate ? account.balance / rate : 0);
      }, 0)
    : 0;
  // Balans qrafiki: əsas hesabın cari balansından geriyə — hər əməliyyatdan sonrakı balans
  const primaryAccount = data ? data.accounts.find((a) => a.currency === "AZN") ?? data.accounts[0] : undefined;
  const balanceSeries = (() => {
    if (!primaryAccount || !history.length) return [];
    const series = [primaryAccount.balance];
    for (let i = history.length - 1; i > 0; i--) {
      const tx = history[i];
      series.unshift(series[0] - (tx.type === "CREDIT" ? tx.amount : -tx.amount));
    }
    return series;
  })();
  const sparkMin = Math.min(...balanceSeries);
  const sparkMax = Math.max(...balanceSeries);
  const sparkPath = balanceSeries
    .map((value, i) => {
      const x = balanceSeries.length > 1 ? 2 + (i / (balanceSeries.length - 1)) * 176 : 90;
      const y = sparkMax === sparkMin ? 28 : 50 - ((value - sparkMin) / (sparkMax - sparkMin)) * 44;
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const sparkChange = balanceSeries.length > 1 && balanceSeries[0] !== 0 ? ((balanceSeries[balanceSeries.length - 1] - balanceSeries[0]) / Math.abs(balanceSeries[0])) * 100 : 0;
  const accountName = (account: Account) => (account.type === "SAVINGS" ? t.savings : t.checking);
  const holder = (data?.user.fullName ?? "").toUpperCase();

  const openBlock = (cardId: number) => {
    setBlockCardId(cardId);
    setBlockError("");
    setBlockKey(bank.newIdempotencyKey());
  };
  const blockCard = async () => {
    if (blockCardId === null || blockPending) return;
    setBlockError("");
    setBlockPending(true);
    try {
      await bank.blockCard(blockCardId, blockReason, blockComment, blockKey);
      setBlockCardId(null);
      setBlockComment("");
      await load();
    } catch (error) {
      setBlockError(errorText(error));
    } finally {
      setBlockPending(false);
    }
  };

  const transfer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const source = data?.accounts.find((account) => account.id === fromAccount);
    if (!source || transferPending) return;
    setTransferError("");
    setTransferPending(true);
    try {
      await bank.transfer({ fromAccountId: source.id, toAccountId: recipient.replace(/\s+/g, ""), amount: Number(amount), currency: source.currency }, idempotencyKey);
      setTransferSent(true);
      setIdempotencyKey(bank.newIdempotencyKey());
      await load();
      window.setTimeout(() => setTransferSent(false), 2600);
    } catch (error) {
      setTransferError(errorText(error));
    } finally {
      setTransferPending(false);
    }
  };
  // Forma dəyişdisə bu artıq başqa köçürmədir → yeni açar
  const editTransfer = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setIdempotencyKey(bank.newIdempotencyKey());
  };

  if (!data) {
    return (
      <div className="bank-app">
        <div className="bank-summary"><div><span>{t.totalBalance}</span><strong>{loadError ? "—" : t.loading}</strong><small>{loadError || t.acrossAccounts}</small></div></div>
      </div>
    );
  }

  return (
    <div className="bank-app">
      <div className="bank-summary">
        <div>
          <span>{t.totalBalance}</span>
          <strong>{money(totalAzn, "AZN")}</strong>
          <small>{t.acrossAccounts}</small>
        </div>
        <div className="balance-spark" aria-label={primaryAccount ? `${primaryAccount.id} · ${history.length}` : undefined}>
          <svg viewBox="0 0 180 55">
            {sparkPath && <path d={sparkPath} />}
          </svg>
          <span>{sparkChange >= 0 ? "+" : ""}{sparkChange.toFixed(1)}%</span>
        </div>
      </div>

      <section className="bank-section">
        <div className="app-section-title">
          <h2>{t.accountsLabel}</h2>
          <span>{data.accounts.length}</span>
        </div>
        <div className="account-grid">
          {data.accounts.map((account) => (
            <article className="account-card" key={account.id}>
              <div><span>{accountName(account)}</span><b>{account.currency}</b></div>
              <strong>{money(account.balance, account.currency)}</strong>
              <small>{t.availableBalance} · {account.id}</small>
            </article>
          ))}
        </div>
      </section>

      <div className="bank-content-grid">
        <section className="bank-section">
          <div className="app-section-title">
            <h2>{t.cardsLabel}</h2>
            <span>{data.cards.length}</span>
          </div>
          <div className="payment-cards">
            {data.cards.map((card) => {
              const blocked = card.status !== "ACTIVE";
              const expires = `${card.expiresAt.slice(5, 7)}/${card.expiresAt.slice(2, 4)}`;
              return (
                <article className={`payment-card ${card.brand === "VISA" ? "visa" : "mastercard"}${blocked ? " blocked" : ""}`} key={card.id}>
                  <div className="payment-card-top">
                    <span className="card-chip" />
                    <b>{card.brand}</b>
                  </div>
                  <code>••••  ••••  ••••  {card.last4}</code>
                  <div className="payment-card-bottom">
                    <span>{holder}</span>
                    <span>{t.expires}<b>{expires}</b></span>
                    <strong>{card.status === "ACTIVE" ? t.active : card.status === "BLOCKED" ? t.blocked : t.expired}</strong>
                  </div>
                  {!blocked && (
                    <button onClick={() => openBlock(card.id)} type="button">
                      <Icon name="lock" size={14} />
                      {t.blockCard}
                    </button>
                  )}
                  {blocked && <div className="blocked-overlay"><Icon name="lock" size={24} />{card.status === "BLOCKED" ? `${t.cardBlocked}${card.statusReason ? ` · ${card.statusReason}` : ""}` : t.expired}</div>}
                </article>
              );
            })}
          </div>
        </section>

        <section className="bank-section transfer-section">
          <div className="app-section-title">
            <h2>{t.transferMoney}</h2>
          </div>
          <form className="transfer-form" onSubmit={transfer}>
            <label>
              <span>{t.fromAccount}</span>
              <select onChange={(event) => editTransfer(setFromAccount)(event.target.value)} value={fromAccount}>
                {data.accounts.map((account) => (
                  <option key={account.id} value={account.id}>{accountName(account)} · {money(account.balance, account.currency)}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{t.recipientIban}</span>
              <input onChange={(event) => editTransfer(setRecipient)(event.target.value)} required value={recipient} />
            </label>
            <div className="transfer-split">
              <label><span>{t.amount}</span><input min="0.01" onChange={(event) => editTransfer(setAmount)(event.target.value)} required step="0.01" type="number" value={amount} /></label>
              <label><span>{t.currency}</span><input readOnly value={data.accounts.find((account) => account.id === fromAccount)?.currency ?? ""} /></label>
            </div>
            <div className="idempotency-field">
              <div>
                <span>{t.idempotencyKey}</span>
                <small>{transferError || t.idempotencyHint}</small>
              </div>
              <code>{idempotencyKey}</code>
            </div>
            <button aria-busy={transferPending} className={transferSent ? "transfer-button success" : "transfer-button"} disabled={transferPending} type="submit">
              <Icon name={transferSent ? "check" : "arrow"} size={17} />
              {transferSent ? t.transferComplete : t.sendTransfer}
            </button>
          </form>
        </section>
      </div>

      <section className="bank-section activity-section">
        <div className="app-section-title"><h2>{t.recentActivity}</h2><span>{data.recentTransactions.length}</span></div>
        {data.recentTransactions.map((tx) => (
          <div className="activity-row" key={tx.id}>
            <span className={tx.type === "CREDIT" ? "activity-icon incoming" : "activity-icon"}><Icon name={tx.type === "CREDIT" ? "arrow" : "card"} size={17} /></span>
            <div><strong>{tx.description}</strong><small>{tx.accountId} · {dateShort(tx.createdAt)}</small></div>
            <b className={tx.type === "CREDIT" ? "positive" : ""}>{tx.type === "CREDIT" ? "+" : "−"} {money(tx.amount, tx.currency)}</b>
          </div>
        ))}
      </section>

      {blockCardId !== null && (
        <ModalBackdrop onClose={() => setBlockCardId(null)}>
          <div
            aria-labelledby="block-card-title"
            aria-modal="true"
            className="block-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-danger-icon"><Icon name="lock" size={23} /></div>
            <h2 id="block-card-title">{t.blockCardTitle}</h2>
            <p>{blockError || t.blockCardText}</p>
            <label>
              <span>{t.reason}</span>
              <select value={blockReason} onChange={(event) => { setBlockReason(event.target.value); setBlockKey(bank.newIdempotencyKey()); }}>
                <option value="LOST">{t.lost}</option>
                <option value="STOLEN">{t.stolen}</option>
                <option value="SUSPECTED_FRAUD">{t.suspectedFraud}</option>
              </select>
            </label>
            <label>
              <span>{t.comment}</span>
              <textarea onChange={(event) => { setBlockComment(event.target.value); setBlockKey(bank.newIdempotencyKey()); }} placeholder={t.commentPlaceholder} value={blockComment} />
            </label>
            <div className="modal-actions">
              <button onClick={() => setBlockCardId(null)} type="button">{t.cancel}</button>
              <button aria-busy={blockPending} disabled={blockPending} onClick={blockCard} type="button">{t.confirmBlock}</button>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}

function CurrencyApp({ t }: { t: Translation }) {
  const [from, setFrom] = useState("AZN");
  const [to, setTo] = useState("USD");
  const [amount, setAmount] = useState(1000);
  const [rates, setRates] = useState<Record<string, number>>({ AZN: 1 });
  const [rateDate, setRateDate] = useState("");
  const [points, setPoints] = useState<{ date: string; rate: number }[]>([]);
  const [ratesError, setRatesError] = useState("");

  // Məzənnələr base=AZN (X-API-Key); çarpaz kurs client-də: (AZN→to) / (AZN→from)
  const loadRates = () => {
    setRatesError("");
    currency
      .rates("AZN")
      .then((result) => {
        setRates({ AZN: 1, ...result.rates });
        setRateDate(result.date);
      })
      .catch((caught) => setRatesError(errorText(caught))); // QA-M08: "0.0000 · İndicə yeniləndi" göstərilməsin
  };
  useEffect(loadRates, []);

  useEffect(() => {
    if (from === to) {
      setPoints([]);
      return;
    }
    currency.history(from, to, 7).then(setPoints).catch(() => setPoints([]));
  }, [from, to]);

  const rate = rates[from] && rates[to] ? rates[to] / rates[from] : 0;
  const known = rate > 0; // məzənnə yoxdursa rəqəm əvəzinə "—"
  const fmt = (value: number) => (known ? value.toFixed(4) : "—");
  const converted = known ? (amount * rate).toFixed(2) : "—";
  const values = points.map((p) => p.rate);
  const low = values.length ? Math.min(...values) : rate;
  const high = values.length ? Math.max(...values) : rate;
  const change = values.length > 1 ? ((values[values.length - 1] - values[0]) / values[0]) * 100 : 0;
  // Qrafik real tarixçədən: 600×230 sahəyə miqyaslanır
  const chartPoints = values.map((value, index) => {
    const x = values.length > 1 ? (index / (values.length - 1)) * 600 : 0;
    const y = high === low ? 115 : 205 - ((value - low) / (high - low)) * 180;
    return [x, y] as const;
  });
  const line = chartPoints.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = chartPoints[chartPoints.length - 1];

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  return (
    <div className="currency-app">
      {ratesError && <LoadError error={ratesError} onRetry={loadRates} t={t} />}
      <div className="currency-grid">
        <section className="converter-card">
          <div className="currency-card-head">
            <div className="app-icon currency"><Icon name="repeat" size={22} /></div>
            <div><h2>{t.exchangeTitle}</h2><p>{t.exchangeSubtitle}</p></div>
          </div>
          <div className="currency-input-block">
            <label htmlFor="currency-from">{t.youSend}</label>
            <div>
              <input
                id="currency-from"
                min="0"
                onChange={(event) => setAmount(Number(event.target.value))}
                type="number"
                value={amount}
              />
              <select value={from} onChange={(event) => setFrom(event.target.value)}>
                {Object.keys(rates).map((code) => <option key={code}>{code}</option>)}
              </select>
            </div>
          </div>
          <div className="swap-row">
            <span />
            <button aria-label={t.swapCurrencies} onClick={swap} type="button">
              <Icon name="repeat" size={18} />
            </button>
            <span />
          </div>
          <div className="currency-input-block receive">
            <label htmlFor="currency-to">{t.youReceive}</label>
            <div>
              <input id="currency-to" readOnly value={converted} />
              <select value={to} onChange={(event) => setTo(event.target.value)}>
                {Object.keys(rates).map((code) => <option key={code}>{code}</option>)}
              </select>
            </div>
          </div>
          <div className="rate-summary">
            <span>{t.exchangeRate}</span>
            <strong>1 {from} = {fmt(rate)} {to}</strong>
            <small>{t.rateDisclaimer} {rateDate}</small>
          </div>
        </section>

        <section className="trend-card">
          <div className="trend-head">
            <div><span>{t.marketTrend}</span><h2>{from} / {to}</h2></div>
            <span className="trend-up">{change >= 0 ? "+" : ""}{change.toFixed(2)}%</span>
          </div>
          <div className="trend-value">
            <strong>{fmt(rate)}</strong>
            <small>{rateDate || (known ? t.updatedNow : "—")}</small>
          </div>
          <div className="mini-chart">
            <svg aria-label={t.marketTrend} preserveAspectRatio="none" role="img" viewBox="0 0 600 230">
              <defs>
                <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-blue)" stopOpacity=".24" />
                  <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path className="chart-grid" d="M0 45H600M0 105H600M0 165H600M0 225H600" />
              {line && <path className="chart-area" d={`${line} L600 230 L0 230Z`} />}
              {line && <path className="chart-line" d={line} />}
              {last && <circle cx={last[0]} cy={last[1]} r="6" />}
            </svg>
            <div className="chart-labels">{points.map((p) => <span key={p.date}>{p.date.slice(5)}</span>)}</div>
          </div>
          <div className="trend-stats">
            <div><span>{t.low}</span><strong>{fmt(low)}</strong></div>
            <div><span>{t.high}</span><strong>{fmt(high)}</strong></div>
            <div><span>{t.exchangeRate}</span><strong>{fmt(rate)}</strong></div>
          </div>
        </section>
      </div>
    </div>
  );
}

const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const durationText = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
// "Bakı (GYD)" → "GYD", "gyd" → "GYD"
const airportCode = (value: string) => (/\(([A-Za-z]{3})\)/.exec(value)?.[1] ?? value.trim()).toUpperCase();

function FlightsApp({ t }: { t: Translation }) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recommended");
  const [query, setQuery] = useState({ from: "Bakı (GYD)", to: "İstanbul (IST)", date: isoDay(3), adults: 1 });
  const [results, setResults] = useState<Flight[]>([]);
  const [searchError, setSearchError] = useState("");
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [passenger, setPassenger] = useState("");
  const [booking, setBooking] = useState<{ id: number } | null>(null);
  const [bookingError, setBookingError] = useState<AuthClientError | null>(null);

  const runSearch = async (q = query) => {
    setSearchError("");
    try {
      const page = await flights.search({ from: airportCode(q.from), to: airportCode(q.to), date: q.date, adults: q.adults });
      setResults(page.items);
    } catch (error) {
      setResults([]);
      setSearchError(errorText(error));
    }
  };

  useEffect(() => {
    void runSearch();
    setPassenger(authClient.getStoredSession()?.user.name ?? "");
  }, []);

  const visibleFlights = results
    .filter((flight) => (filter === "direct" ? flight.stops === 0 : filter === "stop" ? flight.stops >= 1 : true))
    .sort((a, b) => (sort === "price" ? a.price - b.price : sort === "duration" ? a.durationMin - b.durationMin : a.stops - b.stops || a.price - b.price));

  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch();
  };

  const bookFlight = async () => {
    if (!selectedFlight) return;
    setBookingError(null);
    const [firstName, ...rest] = passenger.trim().split(/\s+/);
    const count = Math.max(1, query.adults);
    const passengers = Array.from({ length: count }, (_, i) => ({ firstName: firstName || "Sərnişin", lastName: (rest.join(" ") || "API Lab") + (i ? ` ${i + 1}` : "") }));
    try {
      setBooking(await flights.book(selectedFlight.id, passengers));
      void runSearch();
    } catch (error) {
      setBookingError(error instanceof AuthClientError ? error : new AuthClientError(String(error), 0, "ERROR", ""));
    }
  };

  const closeModal = () => {
    setSelectedFlight(null);
    setBooking(null);
    setBookingError(null);
  };

  return (
    <div className="flights-app travel-app">
      <div className="travel-heading">
        <div className="app-icon flights"><Icon name="plane" size={23} /></div>
        <div><h1>{t.flightSearch}</h1><p>{t.flightSearchSubtitle}</p></div>
      </div>
      <form className="travel-search flight-search" onSubmit={search}>
        <label><span>{t.from}</span><input onChange={(event) => setQuery({ ...query, from: event.target.value })} value={query.from} /></label>
        <label><span>{t.to}</span><input onChange={(event) => setQuery({ ...query, to: event.target.value })} value={query.to} /></label>
        <label><span>{t.departureDate}</span><input onChange={(event) => setQuery({ ...query, date: event.target.value })} type="date" value={query.date} /></label>
        <label><span>{t.adults}</span><select onChange={(event) => setQuery({ ...query, adults: Number(event.target.value) })} value={query.adults}><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
        <button type="submit"><Icon name="search" size={17} />{t.searchFlights}</button>
      </form>

      <div className="results-toolbar">
        <div><h2>{t.flightResults}</h2><span>{searchError || `${visibleFlights.length} ${t.results}`}</span></div>
        <div className="travel-controls">
          <label><span>{t.filters}</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">{t.allFlights}</option><option value="direct">{t.directOnly}</option><option value="stop">{t.oneStop}</option></select></label>
          <label><span>{t.sortBy}</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recommended">{t.recommended}</option><option value="price">{t.lowestPrice}</option><option value="duration">{t.shortestDuration}</option></select></label>
        </div>
      </div>

      <div className="flight-results">
        {visibleFlights.map((flight) => (
          <article className="flight-card" key={flight.id}>
            <div className="airline-mark">{flight.airline.code}</div>
            <div className="airline-name"><strong>{flight.airline.name}</strong><code>{flight.flightNo}</code></div>
            <div className="flight-route">
              <div><strong>{clock(flight.departAt)}</strong><span>{flight.from.code}</span></div>
              <div className="route-line"><span>{durationText(flight.durationMin)}</span><i /><small>{flight.stops === 0 ? t.direct : `${flight.stops} ${t.stop}`}</small></div>
              <div><strong>{clock(flight.arriveAt)}</strong><span>{flight.to.code}</span></div>
            </div>
            <div className="flight-price"><strong>{flight.price} {flight.currency}</strong><span>{t.perAdult}</span></div>
            <button onClick={() => { setSelectedFlight(flight); setBooking(null); setBookingError(null); }} type="button">{t.selectFlight}</button>
          </article>
        ))}
      </div>

      {selectedFlight && (
        <ModalBackdrop onClose={closeModal}>
          <div className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="flight-booking-title" onMouseDown={(event) => event.stopPropagation()}>
            {booking ? (
              <div className="booking-success">
                <span><Icon name="check" size={26} /></span>
                <h2>{t.bookingConfirmed}</h2>
                <code>BK-{booking.id}</code>
                <button onClick={closeModal} type="button">{t.closeMenu}</button>
              </div>
            ) : bookingError ? (
              <div className="booking-error-state">
                <span className="conflict-status">{bookingError.status}</span>
                <h2>{bookingError.code}</h2>
                <p>{bookingError.message}</p>
                <dl>
                  <div><dt>{t.errorCode}</dt><dd>{bookingError.code}</dd></div>
                  <div><dt>{t.traceId}</dt><dd>{bookingError.traceId || "—"}</dd></div>
                </dl>
                <button onClick={closeModal} type="button">{t.refreshResults}</button>
              </div>
            ) : (
              <>
                <div className="booking-modal-head"><div><span>{t.bookingSummary}</span><h2 id="flight-booking-title">{selectedFlight.airline.name}</h2></div><button aria-label={t.closeMenu} onClick={closeModal} type="button"><Icon name="close" size={18} /></button></div>
                <div className="booking-itinerary">
                  <div><strong>{clock(selectedFlight.departAt)}</strong><span>{selectedFlight.from.city} · {selectedFlight.from.code}</span></div>
                  <div><Icon name="plane" size={18} /><span>{durationText(selectedFlight.durationMin)} · {selectedFlight.stops === 0 ? t.direct : `${selectedFlight.stops} ${t.stop}`}</span></div>
                  <div><strong>{clock(selectedFlight.arriveAt)}</strong><span>{selectedFlight.to.city} · {selectedFlight.to.code}</span></div>
                </div>
                <form className="booking-form" onSubmit={(event) => { event.preventDefault(); void bookFlight(); }}>
                  <h3>{t.passengerDetails}</h3>
                  <label><span>{t.fullName}</span><input onChange={(event) => setPassenger(event.target.value)} required value={passenger} /></label>
                  <label><span>{t.adults}</span><input readOnly value={query.adults} /></label>
                  <div className="booking-total"><span>{t.total}</span><strong>{(selectedFlight.price * query.adults).toFixed(2)} {selectedFlight.currency}</strong></div>
                  <button type="submit">{t.confirmBooking}<Icon name="arrow" size={17} /></button>
                </form>
              </>
            )}
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}

function HotelsApp({ t }: { t: Translation }) {
  const [query, setQuery] = useState({ city: "Bakı", checkIn: isoDay(6), checkOut: isoDay(8), guests: 1 });
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState("price");
  const [results, setResults] = useState<Hotel[]>([]);
  const [searchError, setSearchError] = useState("");
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [booking, setBooking] = useState<{ id: number; total: number; currency: string } | null>(null);
  const [bookingError, setBookingError] = useState<AuthClientError | null>(null);
  const nights = Math.max(1, Math.round((Date.parse(query.checkOut) - Date.parse(query.checkIn)) / 86_400_000));

  const runSearch = async (q = query, order = sort) => {
    setSearchError("");
    try {
      setResults((await hotels.search({ ...q, sort: order })).items);
    } catch (error) {
      setResults([]);
      setSearchError(errorText(error));
    }
  };

  useEffect(() => {
    void runSearch();
  }, []);

  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch();
  };

  const ratingLabel = (score: number) => (score >= 9 ? t.excellent : score >= 8.5 ? t.veryGood : t.good);

  // Rezerv: həmin tarixlərdə boş və tutumu kifayət edən ən ucuz otaq
  const openHotel = async (hotel: Hotel) => {
    setSelectedHotel(hotel);
    setBooking(null);
    setBookingError(null);
    setRoom(null);
    try {
      const rooms = await hotels.rooms(hotel.id, query.checkIn, query.checkOut);
      setRoom(rooms.find((r) => r.available !== false && r.capacity >= query.guests) ?? rooms.find((r) => r.capacity >= query.guests) ?? null);
    } catch (error) {
      setBookingError(error instanceof AuthClientError ? error : null);
    }
  };

  const reserve = async () => {
    if (!room) return;
    try {
      setBooking(await hotels.book({ roomId: room.id, checkIn: query.checkIn, checkOut: query.checkOut, guests: query.guests }));
      void runSearch();
    } catch (error) {
      setBookingError(error instanceof AuthClientError ? error : new AuthClientError(String(error), 0, "ERROR", ""));
    }
  };

  const close = () => {
    setSelectedHotel(null);
    setBookingError(null);
    setBooking(null);
  };

  return (
    <div className="hotels-app travel-app">
      <div className="travel-heading">
        <div className="app-icon hotels"><Icon name="globe" size={23} /></div>
        <div><h1>{t.hotelSearch}</h1><p>{t.hotelSearchSubtitle}</p></div>
      </div>
      <form className="travel-search hotel-search" onSubmit={search}>
        <label><span>{t.city}</span><input onChange={(event) => setQuery({ ...query, city: event.target.value })} value={query.city} /></label>
        <label><span>{t.checkIn}</span><input onChange={(event) => setQuery({ ...query, checkIn: event.target.value })} type="date" value={query.checkIn} /></label>
        <label><span>{t.checkOut}</span><input onChange={(event) => setQuery({ ...query, checkOut: event.target.value })} type="date" value={query.checkOut} /></label>
        <label><span>{t.guests}</span><select onChange={(event) => setQuery({ ...query, guests: Number(event.target.value) })} value={query.guests}><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label>
        <button type="submit"><Icon name="search" size={17} />{t.searchHotels}</button>
      </form>

      <div className="results-toolbar">
        <div><h2>{t.hotelResults}</h2><span>{searchError || `${results.filter((h) => h.rating >= minRating).length} ${t.results}`}</span></div>
        <div className="travel-controls">
          <label><span>{t.guestRating}</span><select onChange={(event) => setMinRating(Number(event.target.value))} value={minRating}><option value="0">—</option><option value="8">8+</option><option value="9">9+</option></select></label>
          <label><span>{t.sortBy}</span><select onChange={(event) => { setSort(event.target.value); void runSearch(query, event.target.value); }} value={sort}><option value="-rating">{t.recommended}</option><option value="price">{t.lowestPrice}</option></select></label>
        </div>
      </div>

      <div className="hotel-results">
        {results.filter((hotel) => hotel.rating >= minRating).map((hotel) => (
          <article className="hotel-card" key={hotel.id}>
            <div className="hotel-main">
              <div className="hotel-stars" aria-label={`${hotel.stars} stars`}>
                {Array.from({ length: hotel.stars }).map((_, index) => <Icon key={index} name="star" size={12} />)}
              </div>
              <h2>{hotel.name}</h2>
              <span>{hotel.city}</span>
              <div className="amenity-list">{hotel.amenities.map((amenity) => <span key={amenity}>{amenity}</span>)}</div>
            </div>
            <div className="hotel-rating"><div><strong>{ratingLabel(hotel.rating)}</strong><span>{hotel.availableRooms ?? 0} {t.roomsLeft}</span></div><b>{hotel.rating}</b></div>
            <div className="hotel-price">
              <strong>{hotel.pricePerNightFrom} {hotel.currency}</strong>
              <span>{t.perNight}</span>
              <small>{hotel.currency !== "AZN" && hotel.pricePerNightFromAzn !== null ? `≈ ${hotel.pricePerNightFromAzn} AZN` : t.taxesIncluded}</small>
              <button onClick={() => void openHotel(hotel)} type="button">{t.reserveRoom}</button>
            </div>
          </article>
        ))}
      </div>

      {selectedHotel && (
        <ModalBackdrop onClose={close}>
          <div className="booking-modal hotel-booking-modal" role="dialog" aria-modal="true" aria-labelledby="hotel-booking-title" onMouseDown={(event) => event.stopPropagation()}>
            {bookingError ? (
              <div className="booking-error-state">
                <span className="conflict-status">{bookingError.status}</span>
                <h2>{bookingError.status === 409 ? t.roomUnavailable : bookingError.code}</h2>
                <p>{bookingError.status === 409 ? t.roomUnavailableText : bookingError.message}</p>
                <dl>
                  <div><dt>{t.errorCode}</dt><dd>{bookingError.code}</dd></div>
                  <div><dt>{t.traceId}</dt><dd>{bookingError.traceId || "—"}</dd></div>
                </dl>
                <button onClick={() => { close(); void runSearch(); }} type="button">{t.refreshResults}</button>
              </div>
            ) : booking ? (
              <div className="booking-success">
                <span><Icon name="check" size={26} /></span>
                <h2>{t.bookingConfirmed}</h2>
                <code>HB-{booking.id} · {booking.total} {booking.currency}</code>
                <button onClick={close} type="button">{t.closeMenu}</button>
              </div>
            ) : (
              <>
                <div className="booking-modal-head"><div><span>{t.roomDetails}</span><h2 id="hotel-booking-title">{selectedHotel.name}</h2></div><button aria-label={t.closeMenu} onClick={close} type="button"><Icon name="close" size={18} /></button></div>
                <div className="hotel-booking-summary">
                  <div><span>{t.checkIn}</span><strong>{dateShort(query.checkIn)}</strong></div>
                  <div><span>{t.checkOut}</span><strong>{dateShort(query.checkOut)}</strong></div>
                  <div><span>{t.guests}</span><strong>{query.guests}</strong></div>
                </div>
                <div className="selected-room"><div><strong>{room ? room.roomType : t.loading}</strong><span>{room ? `${room.capacity} · ${room.pricePerNight} ${room.currency} / ${t.perNight}` : ""}</span></div><b>{room ? `${(room.pricePerNight * nights).toFixed(2)} ${room.currency}` : "—"}</b></div>
                <button className="hotel-confirm-button" disabled={!room} onClick={() => void reserve()} type="button">{t.confirmBooking}<Icon name="arrow" size={17} /></button>
              </>
            )}
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}

const COVER_COLORS = ["navy", "blue", "yellow", "green"];

function BooksApp({ t }: { t: Translation }) {
  const [genre, setGenre] = useState("all");
  const [genres, setGenres] = useState<string[]>([]);
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<Book[]>([]);
  const [reviewBook, setReviewBook] = useState<Book | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const load = async (q = term, g = genre) => {
    try {
      setItems((await books.search({ q: q || undefined, genre: g === "all" ? undefined : g })).items);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    // Janr siyahısı real kataloqdan (X-API-Key)
    books.search({}).then((page) => {
      setItems(page.items);
      setGenres([...new Set(page.items.map((b) => b.genre))].sort());
    }).catch(() => undefined);
  }, []);

  const chooseGenre = (id: string) => {
    setGenre(id);
    void load(term, id);
  };

  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void load();
  };

  const publishReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reviewBook) return;
    setReviewError("");
    try {
      await books.review(reviewBook.id, rating, comment);
      setReviewed(true);
      window.setTimeout(() => {
        setReviewBook(null);
        setReviewed(false);
        setComment("");
      }, 1600);
    } catch (error) {
      setReviewError(errorText(error));
    }
  };

  const colorOf = (g: string) => COVER_COLORS[Math.max(0, genres.indexOf(g)) % COVER_COLORS.length];

  return (
    <div className="books-app">
      <div className="library-head">
        <div><span className="section-kicker"><Icon name="book" size={16} />CATALOG API</span><h1>{t.books}</h1><p>{t.booksSubtitle}</p></div>
        <form onSubmit={search}><Icon name="search" size={17} /><input aria-label={t.searchBooks} onChange={(event) => setTerm(event.target.value)} placeholder={t.searchBooks} value={term} /><button type="submit">{t.searchBooks}</button></form>
      </div>
      <div className="genre-chips" role="group" aria-label={t.allGenres}>
        {[["all", t.allGenres], ...genres.map((g) => [g, g])].map(([id, label]) => <button className={genre === id ? "active" : ""} key={id} onClick={() => chooseGenre(id)} type="button">{label}</button>)}
      </div>
      <div className="book-grid">
        {items.map((book) => (
          <article className="book-card" key={book.id}>
            <div className={`book-cover ${colorOf(book.genre)}`}><span>API LAB<br />LIBRARY</span><strong>{book.title}</strong><small>{book.author}</small></div>
            <div className="book-info">
              <span className="book-genre">{book.genre}</span>
              <h2>{book.title}</h2>
              <p>{t.byAuthor} {book.author}{book.year ? ` · ${book.year}` : ""}</p>
              <div className="book-meta"><span><Icon name="star" size={12} />{book.rating}</span><span>{book.pages} {t.pages}</span></div>
              <button onClick={() => { setReviewBook(book); setReviewError(""); }} type="button"><Icon name="edit" size={15} />{t.writeReview}</button>
            </div>
          </article>
        ))}
      </div>
      {reviewBook && (
        <ModalBackdrop onClose={() => setReviewBook(null)}>
          <form className="review-modal" onSubmit={publishReview} onMouseDown={(event) => event.stopPropagation()}>
            <div className="booking-modal-head"><div><span>{t.reviewTitle}</span><h2>{reviewBook.title}</h2></div><button aria-label={t.closeMenu} onClick={() => setReviewBook(null)} type="button"><Icon name="close" size={18} /></button></div>
            <div className="review-form-content">
              <label><span>{t.yourRating}</span><select onChange={(event) => setRating(Number(event.target.value))} value={rating}><option value="5">5 / 5</option><option value="4">4 / 5</option><option value="3">3 / 5</option><option value="2">2 / 5</option><option value="1">1 / 5</option></select></label>
              <label><span>{t.yourReview}</span><textarea onChange={(event) => setComment(event.target.value)} placeholder={reviewError || t.reviewPlaceholder} required value={comment} /></label>
              {reviewError && <small>{reviewError}</small>}
              <button className={reviewed ? "success" : ""} type="submit"><Icon name={reviewed ? "check" : "edit"} size={16} />{reviewed ? t.reviewPublished : t.publishReview}</button>
            </div>
          </form>
        </ModalBackdrop>
      )}
    </div>
  );
}

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function MusicApp({ t }: { t: Translation }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [term, setTerm] = useState("");
  const [playing, setPlaying] = useState<number | null>(null);
  const [embedUrl, setEmbedUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const activeTrack = tracks.find((track) => track.id === playing) ?? tracks[0];

  // BFF: populyar treklər + mənim playlist-lərim (1 sorğu)
  useEffect(() => {
    music.home().then((home) => {
      setTracks(home.popular);
      setPlaylists(home.playlists);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!playing || !activeTrack) return;
    const step = 100 / Math.max(1, activeTrack.durationSec);
    const timer = window.setInterval(() => setProgress((value) => (value >= 100 ? 0 : value + step)), 1000);
    return () => window.clearInterval(timer);
  }, [playing, activeTrack]);

  // play → backend embed URL qaytarır və play_history-ə yazır (video faylı yüklənmir)
  const toggleTrack = async (trackId: number) => {
    if (playing === trackId) {
      setPlaying(null);
      return;
    }
    try {
      const result = await music.play(trackId);
      setPlaying(trackId);
      setEmbedUrl(result.embedUrl);
      setProgress(0);
    } catch {
      setPlaying(null);
    }
  };

  const search = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!term.trim()) return;
    try {
      setTracks(await music.search(term.trim()));
    } catch {
      setTracks([]);
    }
  };

  return (
    <div className="music-app">
      <div className="music-head">
        <div><span className="section-kicker"><Icon name="music" size={16} />STREAMING API</span><h1>{t.music}</h1></div>
        <form onSubmit={search}><Icon name="search" size={17} /><input aria-label={t.searchMusic} onChange={(event) => setTerm(event.target.value)} placeholder={t.searchMusic} value={term} /><button type="submit">{t.searchMusic}</button></form>
      </div>
      <section className="playlist-section">
        <div className="app-section-title"><h2>{t.playlists}</h2><span>{playlists.length}</span></div>
        <div className="playlist-grid">
          {playlists.map((playlist, index) => (
            <article className={`playlist-card playlist-${(index % 3) + 1}`} key={playlist.id}><div><Icon name="music" size={22} /></div><strong>{playlist.name}</strong><span>{playlist.tracks.length} {t.songs}</span></article>
          ))}
        </div>
      </section>
      <section className="track-section">
        <div className="app-section-title"><h2>{t.tracks}</h2><span>{tracks.length}</span></div>
        <div className="track-list">
          <div className="track-head"><span>#</span><span>{t.song}</span><span>{t.album}</span><span>{t.length}</span></div>
          {tracks.map((track) => (
            <div className={playing === track.id ? "track-row active" : "track-row"} key={track.id}>
              <button aria-label={playing === track.id ? t.pauseTrack : t.playTrack} onClick={() => void toggleTrack(track.id)} type="button"><Icon name={playing === track.id ? "pause" : "play"} size={15} /></button>
              <div><strong>{track.title}</strong><span>{track.artist}</span></div>
              <span>{track.genre}</span><code>{mmss(track.durationSec)}</code>
            </div>
          ))}
        </div>
      </section>
      {activeTrack && (
        <div className="music-player">
          <button className="player-play" aria-label={playing ? t.pauseTrack : t.playTrack} onClick={() => void toggleTrack(activeTrack.id)} type="button"><Icon name={playing ? "pause" : "play"} size={18} /></button>
          <div className="player-track"><strong>{activeTrack.title}</strong><span>{activeTrack.artist}</span></div>
          <div className="player-progress"><span>{mmss((progress / 100) * activeTrack.durationSec)}</span><input aria-label={t.nowPlaying} max="100" onChange={(event) => setProgress(Number(event.target.value))} type="range" value={progress} /><span>{mmss(activeTrack.durationSec)}</span></div>
          <button className="video-toggle" aria-label={showVideo ? t.hideVideo : t.showVideo} onClick={() => setShowVideo(!showVideo)} type="button"><Icon name="play" size={14} /></button>
          <div className={showVideo ? "youtube-mini visible" : "youtube-mini"} aria-hidden={!showVideo}>
            <iframe allow="autoplay; encrypted-media" src={showVideo && embedUrl && playing ? `${embedUrl}?autoplay=1` : "about:blank"} title="YouTube music preview" />
          </div>
        </div>
      )}
    </div>
  );
}

type CustomerRowView = { id: number; name: string; email: string; city: string; created: string; source: Customer };

function CustomersApp({ t }: { t: Translation }) {
  const [customersList, setCustomersList] = useState<CustomerRowView[]>([]);
  const [editing, setEditing] = useState<CustomerRowView | "new" | null>(null);
  const [deleting, setDeleting] = useState<CustomerRowView | null>(null);
  const [updateMethod, setUpdateMethod] = useState<"PUT" | "PATCH">("PATCH");
  const [formError, setFormError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [loading, setLoading] = useState(true);
  // QA-L10: səhifələmə (GET /customers?page=&size=) — total/totalPages backend-dən
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const toRow = (c: Customer): CustomerRowView => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, email: c.email, city: c.city ?? "—", created: dateShort(c.createdAt), source: c });
  const load = async (target = page) => {
    setLoading(true);
    try {
      const result = await customers.list(target);
      // Son səhifədəki yeganə sətir silinibsə — bir əvvəlki səhifəyə
      if (result.items.length === 0 && target > 1) return load(target - 1);
      setCustomersList(result.items.map(toRow));
      setTotal(result.total);
      setTotalPages(Math.max(1, result.totalPages));
      setPage(target);
      setLoadError("");
    } catch (error) {
      setLoadError(errorText(error)); // QA-M06: xəta boş cədvəl kimi görünməsin
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(1);
  }, []);

  // "Ad Soyad" → firstName + lastName (backend v1 sxemi)
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const [firstName, ...rest] = String(fields.get("name")).trim().split(/\s+/);
    const input = { firstName, lastName: rest.join(" ") || firstName, email: String(fields.get("email")), city: String(fields.get("company")) };
    setFormError("");
    try {
      if (editing === "new") await customers.create(input);
      else if (editing && updateMethod === "PUT") await customers.replace(editing.source, input);
      else if (editing) await customers.patch(editing.id, input);
      const created = editing === "new";
      setEditing(null);
      await load(created ? 1 : page); // yeni müştəri ən üstdə (sort=-createdAt)
    } catch (error) {
      setFormError(errorText(error));
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteError("");
    try {
      await customers.remove(deleting.id);
      setDeleting(null);
      await load();
    } catch (error) {
      setDeleteError(errorText(error)); // QA-M06: modal açıq qalır, səbəb göstərilir
    }
  };

  return (
    <div className="customers-app">
      <div className="customers-head"><div><span className="section-kicker"><Icon name="users" size={16} />CUSTOMER API</span><h1>{t.customerDirectory}</h1><p>{t.customerSubtitle}</p></div><button onClick={() => { setEditing("new"); setFormError(""); }} type="button"><Icon name="plus" size={17} />{t.createCustomer}</button></div>
      {loadError && <LoadError error={loadError} onRetry={() => void load()} t={t} />}
      <div aria-busy={loading} aria-label={t.customerDirectory} className="customer-table-card table-scroll" role="region" tabIndex={0}>
        <table><thead><tr><th>{t.fullName}</th><th>{t.email}</th><th>{t.city}</th><th>{t.created}</th><th>{t.actions}</th></tr></thead>
          <tbody>{customersList.map((customer) => <tr key={customer.id}><td><span className="table-avatar">{initialsOf(customer.name)}</span><div><strong>{customer.name}</strong><code>#{customer.id}</code></div></td><td>{customer.email}</td><td>{customer.city}</td><td>{customer.created}</td><td><div className="customer-actions"><button aria-label={t.editCustomer} onClick={() => { setEditing(customer); setFormError(""); }} type="button"><Icon name="edit" size={15} /></button><button aria-label={t.deleteCustomer} onClick={() => setDeleting(customer)} type="button"><Icon name="trash" size={15} /></button></div></td></tr>)}</tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <nav aria-label={t.customerDirectory} className="table-pager">
          <button disabled={page <= 1 || loading} onClick={() => void load(page - 1)} type="button">{t.prevPage}</button>
          <span>{page} / {totalPages} {t.pageOf} · {total}</span>
          <button disabled={page >= totalPages || loading} onClick={() => void load(page + 1)} type="button">{t.nextPage}</button>
        </nav>
      )}
      {editing && (
        <ModalBackdrop onClose={() => setEditing(null)}>
          <form className="customer-modal" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}>
            <div className="booking-modal-head"><div><span>CUSTOMER API</span><h2>{editing === "new" ? t.createCustomer : t.editCustomer}</h2></div><button aria-label={t.closeMenu} onClick={() => setEditing(null)} type="button"><Icon name="close" size={18} /></button></div>
            <div className="customer-form">
              {editing !== "new" && <div className="method-choice"><span>{t.updateMethod}</span><div>{(["PUT", "PATCH"] as const).map((method) => <button className={updateMethod === method ? "active" : ""} key={method} onClick={() => setUpdateMethod(method)} type="button">{method}</button>)}</div><small>{formError || (updateMethod === "PUT" ? t.putDescription : t.patchDescription)}</small></div>}
              {editing === "new" && formError && <div className="method-choice"><small>{formError}</small></div>}
              <label><span>{t.fullName}</span><input defaultValue={editing === "new" ? "" : editing.name} name="name" required /></label>
              <label><span>{t.email}</span><input defaultValue={editing === "new" ? "" : editing.email} name="email" required type="email" /></label>
              <label><span>{t.city}</span><input defaultValue={editing === "new" ? "Bakı" : editing.source.city ?? ""} name="company" required /></label>
              <button type="submit">{t.saveCustomer}<Icon name="arrow" size={16} /></button>
            </div>
          </form>
        </ModalBackdrop>
      )}
      {deleting && (
        <ModalBackdrop onClose={() => { setDeleting(null); setDeleteError(""); }}>
          <div className="delete-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="modal-danger-icon"><Icon name="trash" size={22} /></div><h2>{t.deleteCustomerTitle}</h2><p role={deleteError ? "alert" : undefined}>{deleteError ? `${t.deleteFailed}: ${deleteError}` : t.deleteCustomerText}</p><strong>{deleting.name}</strong><div className="modal-actions"><button onClick={() => setDeleting(null)} type="button">{t.cancel}</button><button onClick={() => void remove()} type="button">{t.confirmDelete}</button></div></div>
        </ModalBackdrop>
      )}
    </div>
  );
}

// OAuth axınını addım-addım REAL sorğularla göstərir (əsas sessiyaya toxunmur — token yalnız göstərilir)
function GoogleAuthApp({ t }: { t: Translation }) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState("");
  const [account, setAccount] = useState<GoogleAccount | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const steps = [t.authorizationRequest, t.userConsent, t.authorizationCode, t.tokenExchange];
  const session = authClient.getStoredSession();

  const next = async () => {
    setError("");
    try {
      if (step === 0) {
        const info = await oauthDemo.authorize();
        setState(info.state);
        setAccount(info.accounts.find((a) => a.username === session?.user.username) ?? info.accounts[0] ?? null);
      } else if (step === 1 && account) {
        setCode(await oauthDemo.consent(account, password, state));
      } else if (step === 3) {
        setToken(await oauthDemo.token(code));
      }
      setStep(Math.min(step + 1, 4));
    } catch (caught) {
      setError(errorText(caught));
    }
  };

  const restart = () => {
    setStep(0);
    setCode("");
    setToken("");
    setPassword("");
    setError("");
  };

  return (
    <div className="google-auth-app">
      <div className="oauth-intro"><span className="google-mark">G</span><h1>{t.googleConsent}</h1><p>{error || t.googleConsentSubtitle}</p></div>
      <div className="oauth-layout">
        <aside className="oauth-steps"><span>{t.oauthFlow}</span>{steps.map((label, index) => <div className={step > index ? "complete" : step === index ? "active" : ""} key={label}><i>{step > index ? <Icon name="check" size={13} /> : index + 1}</i><span>{label}</span></div>)}</aside>
        <section className="consent-card">
          {step < 4 ? (
            <>
              <div className="consent-brand"><span className="google-mark">G</span><strong>{t.googleSignIn}</strong><small>{t.currentStep} {Math.min(step + 1, 4)} / 4</small></div>
              {step === 1 && account ? (
                <div className="consent-body"><h2>{t.consentTitle}</h2><div className="consent-account"><span className="avatar">{account.initials}</span><div><strong>{account.name}</strong><span>{account.email}</span></div></div><p>{t.consentPermissions}</p><ul><li><Icon name="users" size={17} />{t.viewProfile}</li><li><Icon name="globe" size={17} />{t.viewEmail}</li></ul><label className="consent-password"><span>{t.oauthPassword}</span><input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></label><div className="consent-actions"><button onClick={restart} type="button">{t.deny}</button><button onClick={() => void next()} type="button">{t.allow}</button></div></div>
              ) : (
                <div className="oauth-step-body"><div className="oauth-code-icon"><Icon name={step === 0 ? "arrow" : step === 2 ? "code" : "lock"} size={25} /></div><h2>{steps[Math.min(step, 3)]}</h2><code>{step === 0 ? "GET /oauth/authorize?response_type=code&client_id=apilab-portal" : step === 2 ? `code=${code}` : "POST /oauth/token grant_type=authorization_code"}</code><button onClick={() => void next()} type="button">{t.continueFlow}<Icon name="arrow" size={16} /></button></div>
              )}
            </>
          ) : (
            <div className="oauth-complete"><span><Icon name="check" size={26} /></span><h2>{t.oauthComplete}</h2><p>{t.oauthCompleteText}</p><code>access_token: {token.slice(0, 24)}••••••••</code><button onClick={restart} type="button">{t.restartFlow}</button></div>
          )}
        </section>
      </div>
    </div>
  );
}

function AppsPage({
  appId,
  onSelectApp,
  onOpenExplorer,
  t,
}: {
  appId: AppId | null; // URL-dən (/apps/bank) — reload və paylaşılan link eyni tətbiqi açır
  onSelectApp: (app: AppId | null) => void;
  onOpenExplorer: () => void;
  t: Translation;
}) {
  const selectedApp = appId;
  const setSelectedApp = onSelectApp;
  const [networkOpen, setNetworkOpen] = useState(true);
  const [calls, setCalls] = useState<NetworkCall[]>([]);
  const apps: {
    id: AppId;
    title: string;
    description: string;
    icon: Parameters<typeof Icon>[0]["name"];
    available: boolean;
  }[] = [
    { id: "bank", title: t.bank, description: t.bankDescription, icon: "bank", available: true },
    { id: "currency", title: t.currency, description: t.currencyDescription, icon: "repeat", available: true },
    { id: "flights", title: t.flights, description: t.flightsDescription, icon: "plane", available: true },
    { id: "hotels", title: t.hotels, description: t.hotelsDescription, icon: "globe", available: true },
    { id: "books", title: t.books, description: t.booksDescription, icon: "book", available: true },
    { id: "music", title: t.music, description: t.musicDescription, icon: "music", available: true },
    { id: "google", title: t.googleSignIn, description: t.googleDescription, icon: "lock", available: true },
    { id: "customers", title: t.customers, description: t.customersDescription, icon: "users", available: true },
  ];

  // Network panel: tətbiq açıq olduğu müddətdə portalın ETDİYİ REAL sorğular (BFF-də meta.calls → internal calls)
  useEffect(() => {
    if (!selectedApp) return;
    return subscribeNetwork((call) => setCalls((items) => [call, ...items].slice(0, 12)));
  }, [selectedApp]);

  const openApp = (id: AppId) => {
    setCalls([]);
    setNetworkOpen(true);
    setSelectedApp(id);
  };

  if (!selectedApp) {
    return (
      <main className="apps-page" id="main-content">
        <div className="apps-hero">
          <span className="section-kicker"><Icon name="code" size={16} />{t.appsKicker}</span>
          <h1>{t.appsTitle}</h1>
          <p>{t.appsSubtitle}</p>
        </div>
        <div className="apps-grid">
          {apps.map((app, index) => (
            <article className={`app-card app-card-${index + 1}`} key={app.id}>
              <div className={`app-icon ${app.id}`}><Icon name={app.icon} size={24} /></div>
              <span className={app.available ? "app-availability available" : "app-availability"}>
                <i />{app.available ? t.available : t.comingSoon}
              </span>
              <h2>{app.title}</h2>
              <p>{app.description}</p>
              <button onClick={() => openApp(app.id)} type="button">
                {t.openApp}<Icon name="arrow" size={17} />
              </button>
            </article>
          ))}
        </div>
      </main>
    );
  }

  const activeApp = apps.find((app) => app.id === selectedApp)!;
  return (
    <main className="app-detail-page" id="main-content">
      <div className="app-detail-topbar">
        <button onClick={() => setSelectedApp(null)} type="button">
          <Icon name="arrow" size={17} />{t.backToApps}
        </button>
        <div>
          <span className={`app-icon ${activeApp.id}`}><Icon name={activeApp.icon} size={19} /></span>
          <strong>{activeApp.title}</strong>
          <span className="sandbox-label">{t.sandbox}</span>
        </div>
      </div>
      <div className={networkOpen ? "app-detail-shell" : "app-detail-shell network-closed"}>
        <div className="app-product">
          {selectedApp === "bank" ? (
            <BankApp t={t} />
          ) : selectedApp === "currency" ? (
            <CurrencyApp t={t} />
          ) : selectedApp === "flights" ? (
            <FlightsApp t={t} />
          ) : selectedApp === "hotels" ? (
            <HotelsApp t={t} />
          ) : selectedApp === "books" ? (
            <BooksApp t={t} />
          ) : selectedApp === "music" ? (
            <MusicApp t={t} />
          ) : selectedApp === "customers" ? (
            <CustomersApp t={t} />
          ) : (
            <GoogleAuthApp t={t} />
          )}
        </div>
        <NetworkPanel
          calls={calls}
          onOpenExplorer={onOpenExplorer}
          open={networkOpen}
          setOpen={setNetworkOpen}
          t={t}
        />
      </div>
    </main>
  );
}

function GoogleOAuthModal({
  onClose,
  onSignedIn,
  t,
}: {
  onClose: () => void;
  onSignedIn: (session: AuthSession) => void;
  t: Translation;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement as HTMLElement | null,
  );
  const [step, setStep] = useState(0);
  const [oauthState, setOauthState] = useState("");
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<GoogleAccount | null>(
    null,
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState<"denied" | "invalid" | null>(null);
  const [errorDetail, setErrorDetail] = useState("");
  const [showCalls, setShowCalls] = useState(false);
  const [successName, setSuccessName] = useState("");
  const [calls, setCalls] = useState<NetworkCall[]>([]);
  const steps = [
    t.redirectAuthServer,
    t.chooseAccount,
    t.consent,
    t.tokenExchangeStep,
  ];

  // Modal açıq olduğu müddətdə real OAuth sorğuları "HTTP calls" panelində
  useEffect(() => subscribeNetwork((call) => setCalls((items) => [...items, call])), []);

  useEffect(() => {
    return () => returnFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    focusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", handleKeyDown);
    return () => dialog.removeEventListener("keydown", handleKeyDown);
  }, [onClose, step, error, showCalls]);

  // 1. GET /oauth/authorize — provider-dən client və hesablar
  useEffect(() => {
    let cancelled = false;
    authClient
      .authorizeGoogle()
      .then((result) => {
        if (cancelled) return;
        setOauthState(result.state);
        setAccounts(result.accounts);
        setStep(1);
      })
      .catch((caught) => {
        if (cancelled) return;
        setErrorDetail(errorText(caught));
        setError("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 2–4. consent (POST /oauth/authorize) → code + state yoxlaması → POST /oauth/token → GET /oauth/userinfo
  const allow = async () => {
    if (!selectedAccount) return;
    setStep(3);
    try {
      const session = await authClient.exchangeGoogleCode(selectedAccount, password, oauthState);
      setSuccessName(session.user.name);
      window.setTimeout(() => onSignedIn(session), 900);
    } catch (caught) {
      setErrorDetail(errorText(caught));
      setError("invalid");
    }
  };

  const deny = async () => {
    await authClient.denyGoogle(oauthState).catch(() => undefined);
    setError("denied");
  };

  const reset = () => {
    setError(null);
    setErrorDetail("");
    setSelectedAccount(null);
    setPassword("");
    setSuccessName("");
    setStep(1);
  };

  return (
    <div className="auth-modal-backdrop" role="presentation">
      <div
        aria-labelledby="oauth-modal-title"
        aria-modal="true"
        className="google-oauth-modal"
        ref={dialogRef}
        role="dialog"
      >
        <div className="oauth-modal-progress" aria-live="polite">
          {steps.map((label, index) => (
            <div
              className={
                step > index
                  ? "complete"
                  : step === index
                    ? "active"
                    : ""
              }
              key={label}
            >
              <span>
                {step > index ? <Icon name="check" size={13} /> : index + 1}
              </span>
              <small>{label}</small>
            </div>
          ))}
        </div>

        <div className="google-popup">
          <div className="google-popup-head">
            <strong id="oauth-modal-title">{t.continueWithGoogle}</strong>
            <button aria-label={t.closeMenu} onClick={onClose} type="button">
              <Icon name="close" size={18} />
            </button>
          </div>

          {error ? (
            <div className="oauth-flow-error" role="alert">
              <span>!</span>
              <h2>{error === "denied" ? t.accessDenied : t.invalidCode}</h2>
              <p>
                {error === "denied"
                  ? t.accessDeniedText
                  : errorDetail || t.invalidCodeText}
              </p>
              <button onClick={reset} type="button">
                {t.tryAgain}
              </button>
            </div>
          ) : step === 0 ? (
            <div className="oauth-redirecting">
              <span className="oauth-loader" />
              <h2>{t.redirectAuthServer}</h2>
              <code>GET /oauth/authorize?response_type=code</code>
            </div>
          ) : step === 1 ? (
            <div className="account-chooser">
              <h2>{t.chooseAccount}</h2>
              <p>API Lab</p>
              <div>
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => {
                      setSelectedAccount(account);
                      setStep(2);
                    }}
                    type="button"
                  >
                    <span className="google-account-avatar">
                      {account.initials}
                    </span>
                    <span>
                      <strong>{account.name}</strong>
                      <small>{account.email}</small>
                    </span>
                    <Icon name="chevron" size={17} />
                  </button>
                ))}
                <button
                  onClick={() => setError("invalid")}
                  type="button"
                >
                  <span className="google-account-avatar add">
                    <Icon name="plus" size={18} />
                  </span>
                  <span>
                    <strong>{t.useAnotherAccount}</strong>
                    <small>{t.anotherAccountUnavailable}</small>
                  </span>
                </button>
              </div>
            </div>
          ) : step === 2 && selectedAccount ? (
            <div className="google-consent-screen">
              <div className="selected-google-account">
                <span>{selectedAccount.initials}</span>
                <div>
                  <strong>{selectedAccount.name}</strong>
                  <small>{selectedAccount.email}</small>
                </div>
              </div>
              <h2>{t.googleAccessTitle}</h2>
              <div className="google-permissions">
                <div>
                  <Icon name="users" size={18} />
                  <span>{t.permissionIdentity}</span>
                </div>
                <div>
                  <Icon name="compass" size={18} />
                  <span>{t.permissionSandbox}</span>
                </div>
              </div>
              <label className="consent-password">
                <span>{t.oauthPassword}</span>
                <input
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void allow();
                  }}
                  type="password"
                  value={password}
                />
              </label>
              <p className="mock-google-notice">{t.mockGoogleNotice}</p>
              <div className="google-consent-actions">
                <button onClick={() => void deny()} type="button">
                  {t.cancel}
                </button>
                <button disabled={!password} onClick={() => void allow()} type="button">
                  {t.allow}
                </button>
              </div>
            </div>
          ) : (
            <div className="token-exchange-screen" aria-live="polite">
              {successName ? (
                <>
                  <span className="exchange-success">
                    <Icon name="check" size={25} />
                  </span>
                  <div className="auth-success-toast" role="status">
                    <Icon name="check" size={16} />
                    <strong>{t.signedInAs} {successName}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div className="exchange-skeleton">
                    <i />
                    <i />
                    <i />
                  </div>
                  <h2>{t.exchangingCode}</h2>
                </>
              )}
              <ul>
                <li className="complete">
                  <Icon name="check" size={15} />
                  {t.codeReceived}
                </li>
                <li className="complete">
                  <Icon name="check" size={15} />
                  {t.stateVerified}
                </li>
                <li className={successName ? "complete" : ""}>
                  {successName ? (
                    <Icon name="check" size={15} />
                  ) : (
                    <span className="button-spinner" />
                  )}
                  {t.accessTokenIssued}
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="oauth-http-panel">
          <button
            aria-expanded={showCalls}
            onClick={() => setShowCalls(!showCalls)}
            type="button"
          >
            <Icon name="code" size={16} />
            {showCalls ? t.hideHttpCalls : t.showHttpCalls}
            <Icon name="chevron" size={15} />
          </button>
          {showCalls && (
            <div>
              <span>{t.oauthRequests}</span>
              {calls.map((call) => (
                <div className="oauth-http-call" key={call.id}>
                  <span
                    className={`mini-method method-${call.method.toLowerCase()}`}
                  >
                    {call.method}
                  </span>
                  <code>{call.url.replace(/(code|state)=[^&]+/g, "$1=•••")}</code>
                  <StatusChip status={call.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SignInPage({
  onSignedIn,
  t,
}: {
  onSignedIn: (session: AuthSession) => void;
  t: Translation;
}) {
  const [username, setUsername] = useState("student");
  const [password, setPassword] = useState("student123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AuthClientError | null>(null);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [googleOpen, setGoogleOpen] = useState(false);

  useEffect(() => {
    if (retryCountdown <= 0) return;
    const timer = window.setInterval(
      () => setRetryCountdown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [retryCountdown]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (retryCountdown > 0) return;
    setLoading(true);
    setError(null);
    try {
      const session = await authClient.login(username, password);
      onSignedIn(session);
    } catch (caught) {
      const nextError =
        caught instanceof AuthClientError
          ? caught
          : new AuthClientError(
              "Authentication failed",
              500,
              "AUTH_UNKNOWN",
              "",
            );
      setError(nextError);
      setRetryCountdown(nextError.retryAfter ?? 0);
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (account: "student" | "admin" | "rauf") => {
    const passwords = {
      student: "student123",
      admin: "admin123",
      rauf: "rauf123",
    };
    setUsername(account);
    setPassword(passwords[account]);
    setError(null);
  };

  return (
    <main className="signin-page" id="main-content">
      <div className="signin-layout">
        <section className="signin-benefits">
          <span className="section-kicker section-kicker--light">
            <Icon name="lock" size={16} />
            OAuth 2.0 · API LAB
          </span>
          <h1>{t.signInHeroTitle}</h1>
          <p>{t.signInHeroSubtitle}</p>
          <div className="benefit-list">
            {[
              ["network", t.benefitEndpoints],
              ["lock", t.benefitSandbox],
              ["code", t.benefitTools],
            ].map(([icon, label]) => (
              <div key={label}>
                <span>
                  <Icon
                    name={icon as "network" | "lock" | "code"}
                    size={18}
                  />
                </span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>
          <div className="signin-how">
            <Icon name="book" size={18} />
            <span>{t.howItWorks}</span>
          </div>
        </section>

        <section className="signin-card">
          <div className="signin-card-title">
            <span className="brand-mark">
              <Icon name="code" size={20} />
            </span>
            <div>
              <h2>{t.welcomeBack}</h2>
              <p>{t.signInToContinue}</p>
            </div>
          </div>
          <button
            className="google-signin-button"
            onClick={() => setGoogleOpen(true)}
            type="button"
          >
            <GoogleMark />
            {t.continueWithGoogle}
          </button>
          <div className="signin-divider">
            <span>{t.orLabel}</span>
          </div>
          <form className="demo-login-form" onSubmit={submit}>
            <label>
              <span>{t.username}</span>
              <input
                autoComplete="username"
                onChange={(event) => setUsername(event.target.value)}
                value={username}
              />
            </label>
            <label>
              <span>{t.password}</span>
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>
            {error && (
              <div
                className={error.status === 429 ? "login-error rate" : "login-error"}
                role="alert"
              >
                <strong>
                  {error.status === 429
                    ? t.tooManyAttempts
                    : error.status === 401
                      ? t.wrongCredentials
                      : error.message}
                </strong>
                {error.status === 429 && retryCountdown > 0 && (
                  <span>
                    {t.retryAfter} {retryCountdown} {t.seconds}
                  </span>
                )}
                <code>
                  {t.authErrorCode}: {error.code} · {t.authTraceId}:{" "}
                  {error.traceId}
                </code>
              </div>
            )}
            <button
              disabled={loading || retryCountdown > 0}
              type="submit"
            >
              {loading ? (
                <span className="button-spinner" />
              ) : (
                <Icon name="arrow" size={17} />
              )}
              {loading ? t.signingIn : t.signIn}
            </button>
          </form>
          <div className="demo-account-block">
            <span>{t.demoAccountsHelper}</span>
            <div>
              {(["student", "admin", "rauf"] as const).map((account) => (
                <button
                  className={username === account ? "active" : ""}
                  key={account}
                  onClick={() => fillDemo(account)}
                  type="button"
                >
                  {account}
                </button>
              ))}
            </div>
          </div>
          <p className="signin-privacy">
            <Icon name="lock" size={14} />
            {t.privacyNote}
          </p>
        </section>
      </div>

      {googleOpen && (
        <GoogleOAuthModal
          onClose={() => setGoogleOpen(false)}
          onSignedIn={onSignedIn}
          t={t}
        />
      )}
    </main>
  );
}

// JWT-nin header və payload hissələri base64url-dir — imza olmadan oxunur (şifrələnməyib!)
function decodeJwtPart(part: string | undefined): Record<string, unknown> | null {
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}
const timeOf = (epochSeconds: unknown) =>
  typeof epochSeconds === "number" ? new Date(epochSeconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

function AuthLabPage({ t }: { t: Translation }) {
  const [loginState, setLoginState] = useState<"idle" | "loading" | "success">("idle");
  const [labUser, setLabUser] = useState({ username: "student", password: "student123" });
  const [labError, setLabError] = useState("");
  const [jwt, setJwt] = useState(() => authClient.getStoredSession()?.accessToken ?? "");
  const [refreshToken, setRefreshToken] = useState(() => authClient.getStoredSession()?.refreshToken ?? "");
  const [decoded, setDecoded] = useState(Boolean(jwt));
  const [refreshed, setRefreshed] = useState(false);
  const [oauthStep, setOauthStep] = useState(-1);
  const [animating, setAnimating] = useState(false);
  const [header, payload] = [decodeJwtPart(jwt.split(".")[0]), decodeJwtPart(jwt.split(".")[1])];

  useEffect(() => {
    if (!animating) return;
    if (oauthStep >= 3) {
      setAnimating(false);
      return;
    }
    const timer = window.setTimeout(() => setOauthStep((step) => step + 1), 1100);
    return () => window.clearTimeout(timer);
  }, [animating, oauthStep]);

  // Real POST /api/v1/auth/login — əsas sessiyaya toxunmur, token yalnız burada göstərilir
  const login = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginState("loading");
    setLabError("");
    try {
      const tokens = await authClient.labLogin(labUser.username, labUser.password);
      setJwt(tokens.access_token);
      setRefreshToken(tokens.refresh_token ?? "");
      setDecoded(true);
      setLoginState("success");
    } catch (error) {
      setLabError(errorText(error));
      setLoginState("idle");
    }
  };

  // Real POST /api/v1/auth/refresh — rotation: köhnə refresh token artıq işləmir
  const refreshTokenNow = async () => {
    if (!refreshToken) {
      setLabError(t.loadError);
      return;
    }
    try {
      const tokens = await authClient.labRefresh(refreshToken);
      setJwt(tokens.access_token);
      setRefreshToken(tokens.refresh_token ?? "");
      setRefreshed(true);
      setLabError("");
      window.setTimeout(() => setRefreshed(false), 1800);
    } catch (error) {
      setLabError(errorText(error));
    }
  };

  const startOauth = () => {
    setOauthStep(0);
    setAnimating(true);
  };

  const oauthSteps = [
    { from: t.browser, to: t.authorizationServer, label: t.redirectToLogin, code: "GET /oauth/authorize" },
    { from: t.authorizationServer, to: t.browser, label: t.returnCode, code: "302 /oauth/callback?code=...&state=..." },
    { from: t.browser, to: t.authorizationServer, label: t.exchangeCode, code: "POST /oauth/token" },
    { from: t.browser, to: t.apiServer, label: t.callApi, code: "Authorization: Bearer ..." },
  ];

  return (
    <main className="lab-page auth-lab-page" id="main-content">
      <div className="lab-title">
        <span className="section-kicker"><Icon name="lock" size={16} />{t.authenticationSandbox}</span>
        <h1>{t.authLabTitle}</h1>
        <p>{t.authLabSubtitle}</p>
      </div>

      <div className="auth-top-grid">
        <section className="lab-card login-lab-card">
          <div className="lab-card-heading"><span className="lab-card-icon"><Icon name="lock" size={20} /></span><div><h2>{t.login}</h2><p>{labError || t.loginDescription}</p></div></div>
          <form onSubmit={login}>
            <label><span>{t.username}</span><input onChange={(event) => setLabUser({ ...labUser, username: event.target.value })} value={labUser.username} /></label>
            <label><span>{t.password}</span><input onChange={(event) => setLabUser({ ...labUser, password: event.target.value })} type="password" value={labUser.password} /></label>
            <button className={loginState === "success" ? "success" : ""} type="submit">
              {loginState === "loading" ? <span className="button-spinner" /> : <Icon name={loginState === "success" ? "check" : "arrow"} size={17} />}
              {loginState === "loading" ? t.signingIn : loginState === "success" ? t.loginSuccess : t.signIn}
            </button>
          </form>
          {loginState === "success" && <div className="token-ready"><Icon name="check" size={15} /><span>{t.accessTokenReady}</span><code>200 OK</code></div>}
        </section>

        <section className="lab-card jwt-card">
          <div className="lab-card-heading"><span className="lab-card-icon blue"><Icon name="code" size={20} /></span><div><h2>{t.jwtDecoder}</h2><p>{t.jwtDescription}</p></div></div>
          <label className="jwt-input"><span>{t.pasteJwt}</span><textarea onChange={(event) => setJwt(event.target.value.trim())} spellCheck="false" value={jwt} /></label>
          <div className="jwt-actions">
            <button onClick={() => setDecoded(true)} type="button">{t.decode}</button>
            <button className={refreshed ? "success" : ""} onClick={() => void refreshTokenNow()} type="button"><Icon name={refreshed ? "check" : "repeat"} size={15} />{refreshed ? t.tokenRefreshed : t.refresh}</button>
          </div>
        </section>
      </div>

      {decoded && (
        <section className="jwt-parts" aria-label={t.jwtDecoder}>
          <article className="jwt-part header-part"><div><span>1</span><h3>{t.jwtHeader}</h3></div><pre>{header ? JSON.stringify(header, null, 2) : "—"}</pre></article>
          <article className="jwt-part payload-part"><div><span>2</span><h3>{t.jwtPayload}</h3></div><pre>{payload ? JSON.stringify(payload, null, 2) : "—"}</pre><div className="jwt-time"><span>{t.issuedAt}<b>{timeOf(payload?.iat)}</b></span><span>{t.expiresAt}<b>{timeOf(payload?.exp)}</b></span></div></article>
          <article className="jwt-part signature-part"><div><span>3</span><h3>{t.jwtSignature}</h3></div><pre>HMACSHA256(<br />&nbsp; base64UrlEncode(header) + "." +<br />&nbsp; base64UrlEncode(payload),<br />&nbsp; secret<br />)<br /><br />{jwt.split(".")[2]?.slice(0, 24) ?? ""}…</pre></article>
        </section>
      )}

      <section className="oauth-diagram-card">
        <div className="oauth-diagram-head"><div><span className="section-kicker"><Icon name="network" size={16} />{t.sequenceDiagram}</span><h2>{t.oauthSequence}</h2><p>{t.oauthSequenceSubtitle}</p></div><button onClick={startOauth} type="button"><Icon name={oauthStep < 0 ? "play" : "repeat"} size={16} />{oauthStep < 0 ? t.startAnimation : t.replayAnimation}</button></div>
        <div className="sequence-actors">
          {[t.browser, t.authorizationServer, t.apiServer].map((actor, index) => <div key={actor}><span className={`actor-icon actor-${index + 1}`}><Icon name={index === 0 ? "globe" : index === 1 ? "lock" : "code"} size={20} /></span><strong>{actor}</strong><i /></div>)}
        </div>
        <div className="sequence-flow">
          {oauthSteps.map((step, index) => (
            <div className={oauthStep > index ? "sequence-step done" : oauthStep === index ? "sequence-step active" : "sequence-step"} key={step.label}>
              <span>{String(index + 1).padStart(2, "0")}</span><div><strong>{step.label}</strong><code>{step.code}</code><i /></div><small>{step.from} → {step.to}</small>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

type SqlView = { columns: string[]; rows: string[][]; durationMs: number; truncated: boolean };

function SqlPlaygroundPage({ t }: { t: Translation }) {
  const [query, setQuery] = useState(() => handoffs.take().sql ?? "SELECT id, username, full_name, email, role\nFROM users\nORDER BY id;");
  const [result, setResult] = useState<SqlView | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [tables, setTables] = useState<DbTable[]>([]);
  const [selectedTable, setSelectedTable] = useState("users");
  const [schemaError, setSchemaError] = useState("");

  // Sxem ağacı real DB-dən (GET /api/v1/_db/schema); gizli sütunlar (hash) işarələnir
  const loadSchema = () => {
    setSchemaError("");
    sql
      .schema()
      .then(setTables)
      .catch((caught) => {
        setTables([]);
        setSchemaError(errorText(caught)); // QA-M07: "0 cədvəl" əvəzinə xəta
      });
  };
  useEffect(loadSchema, []);

  const execute = async (nextQuery = query) => {
    setQuery(nextQuery);
    setError(null);
    setRunning(true);
    try {
      const r = await sql.query(nextQuery);
      setResult({
        columns: r.columns,
        rows: r.rows.map((row) => r.columns.map((column) => (row[column] === null ? "NULL" : String(row[column])))),
        durationMs: r.durationMs,
        truncated: r.truncated,
      });
    } catch (caught) {
      setResult(null);
      setError(caught instanceof AuthClientError ? { code: caught.code, message: caught.details[0]?.message ?? caught.message } : { code: "ERROR", message: String(caught) });
    } finally {
      setRunning(false);
    }
  };

  const quickQueries = [
    [t.allUsers, "SELECT id, username, full_name, email, role\nFROM users\nORDER BY id;"],
    [t.activeCards, "SELECT id, owner_id, brand, last4, status\nFROM cards\nWHERE status = 'ACTIVE';"],
    [t.recentBookings, "SELECT b.id, f.flight_no, b.status, b.passengers, b.created_at\nFROM flight_bookings b\nJOIN flights f ON f.id = b.flight_id\nORDER BY b.created_at DESC\nLIMIT 10;"],
  ];
  const lineCount = Math.max(6, query.split("\n").length);
  const tableCount = tables.filter((table) => table.type === "table").length;

  return (
    <main className="sql-page" id="main-content">
      <div className="sql-titlebar"><div><span className="section-kicker"><Icon name="code" size={16} />{t.dataLab}</span><h1>{t.sqlPlayground}</h1><p>{t.sqlSubtitle}</p></div><div className="select-only-badge"><Icon name="lock" size={15} /><span><strong>{t.selectOnly}</strong><small>{t.selectOnlyNotice}</small></span></div></div>
      {schemaError && <LoadError error={schemaError} onRetry={loadSchema} t={t} />}
      <div className="quick-query-row"><span>{t.quickQueries}</span>{quickQueries.map(([label, text]) => <button key={label} onClick={() => void execute(text)} type="button"><Icon name="play" size={12} />{label}</button>)}</div>
      <div className="sql-workspace">
        <aside className="schema-panel">
          <div className="sql-panel-head"><span>{t.schemaTree}</span><code>main</code></div>
          <div className="schema-title"><Icon name="chevron" size={13} /><span>{t.tables}</span><b>{tableCount}</b></div>
          {tables.map((table) => (
            <div className={selectedTable === table.name ? "schema-table active" : "schema-table"} key={table.name}>
              <button onClick={() => setSelectedTable(table.name)} type="button"><Icon name="chevron" size={13} /><span>{table.name}{table.type === "view" ? " (view)" : ""}</span></button>
              {selectedTable === table.name && <div>{table.columns.map((column) => <code key={column.name}>{column.name} · {column.type || "—"}{column.primaryKey ? " · PK" : ""}{column.hidden ? " · hidden" : ""}</code>)}</div>}
            </div>
          ))}
        </aside>
        <section className="sql-editor-panel">
          <div className="sql-panel-head"><span>{t.sqlEditor}</span><div><button onClick={() => setQuery(query.replace(/\s+/g, " ").replace(/ (FROM|WHERE|JOIN|LEFT JOIN|GROUP BY|ORDER BY|HAVING|LIMIT) /gi, "\n$1 ").trim())} type="button">{t.formatQuery}</button><button disabled={running} onClick={() => void execute()} type="button">{running ? <span className="button-spinner" /> : <Icon name="play" size={14} />}{running ? t.runningQuery : t.runQuery}</button></div></div>
          <div className="sql-code-editor"><div className="line-numbers">{Array.from({ length: lineCount }, (_, i) => <span key={i}>{i + 1}<br /></span>)}</div><textarea aria-label={t.sqlEditor} onChange={(event) => setQuery(event.target.value)} spellCheck="false" value={query} /></div>
          {error && <div className="sql-error"><span>!</span><strong>{error.message}</strong><code>{error.code}</code></div>}
          <div className="sql-results">
            <div className="results-head"><span>{t.queryResults}</span>{result && <small>{result.rows.length}{result.truncated ? "+" : ""} {t.rowsReturned} · {t.queryTime}: {result.durationMs} ms</small>}</div>
            {running ? <div className="sql-result-skeleton"><i /><i /><i /></div> : result ? <div aria-label={t.queryResults} className="table-scroll" role="region" tabIndex={0}><table><thead><tr>{result.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><code>{cell}</code></td>)}</tr>)}</tbody></table></div> : <div className="sql-empty"><span><Icon name="code" size={24} /></span><h3>{t.sqlEmptyTitle}</h3><p>{t.sqlEmptyText}</p></div>}
          </div>
        </section>
      </div>
    </main>
  );
}

const KIND_ICON: Record<string, "compass" | "network" | "lock" | "code"> = { SLIDES: "compass", DOCUMENT: "network", TASKSHEET: "code", OTHER: "lock" };
const MATERIAL_KINDS: MaterialKind[] = ["SLIDES", "DOCUMENT", "TASKSHEET", "OTHER"];
const fileExt = (name: string) => (name.split(".").pop() ?? "").toUpperCase();
const sizeText = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function MaterialStatusBadge({ status, t }: { status: MaterialStatus; t: Translation }) {
  const label = status === "READY" ? "READY" : status === "READY_NO_PREVIEW" ? "READY_NO_PREVIEW" : status === "FAILED" ? "FAILED" : t.matProcessing;
  return <span className={`mat-badge mat-badge-${status.toLowerCase()}`}>{label}</span>;
}

// Backend xətası (413/415/422) istifadəçi üçün: başlıq + kod + təfərrüat
function uploadErrorView(error: AuthClientError, t: Translation) {
  const title = error.status === 413 ? t.matErrTooLarge : error.status === 415 ? t.matErrType : error.status === 422 ? t.matErrValidation : t.matErrOther;
  return { title, code: `${error.status} ${error.code}`, message: error.message, details: error.details.map((d) => `${d.field}: ${d.message}`) };
}

function MaterialUploader({ onUploaded, t }: { onUploaded: (m: Material) => void; t: Translation }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [lesson, setLesson] = useState("");
  const [kind, setKind] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof uploadErrorView> | null>(null);

  const choose = (next: File | undefined) => {
    if (!next) return;
    setFile(next);
    setError(null);
    if (!title) setTitle(next.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    const lessonMatch = /(?:ders|dərs|lesson)[\s_-]*([123])(?!\d)/i.exec(next.name);
    if (lessonMatch && !lesson) setLesson(lessonMatch[1]);
  };

  // Client tərəfi ilkin yoxlama sürətli rəy üçündür; əsl qərarı backend verir (uzantı + MIME + magic bytes)
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (file.size > UPLOAD_MAX_BYTES) {
      setError({ title: t.matErrTooLarge, code: "413", message: `${sizeText(file.size)} > ${sizeText(UPLOAD_MAX_BYTES)}`, details: [] });
      return;
    }
    if (!UPLOAD_EXTENSIONS.includes(ext)) {
      setError({ title: t.matErrType, code: "415", message: `.${ext || "?"} — ${UPLOAD_EXTENSIONS.join(", ")}`, details: [] });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await learning.upload(file, { title: title.trim(), lesson: lesson ? Number(lesson) : null, kind: (kind || undefined) as MaterialKind | undefined });
      onUploaded(created);
      setFile(null);
      setTitle("");
      setLesson("");
      setKind("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (caught) {
      setError(caught instanceof AuthClientError ? uploadErrorView(caught, t) : { title: t.matErrOther, code: "", message: String(caught), details: [] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="mat-uploader lab-card" onSubmit={submit}>
      <div className="lab-card-heading"><span className="lab-card-icon"><Icon name="plus" size={20} /></span><div><h2>{t.matUpload}</h2><p>{t.matDropHint}</p></div></div>
      <label
        className={dragging ? "mat-dropzone dragging" : file ? "mat-dropzone has-file" : "mat-dropzone"}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          choose(event.dataTransfer.files[0]);
        }}
      >
        <input accept=".pdf,.pptx,.docx,.md" onChange={(event) => choose(event.target.files?.[0])} ref={inputRef} type="file" />
        <Icon name={file ? "check" : "arrow"} size={22} />
        <strong>{file ? file.name : t.matDrop}</strong>
        <small>{file ? sizeText(file.size) : t.matDropHint}</small>
      </label>
      <div className="mat-form-row">
        <label><span>{t.matTitle}</span><input onChange={(event) => setTitle(event.target.value)} value={title} /></label>
        <label><span>{t.matLesson}</span><select onChange={(event) => setLesson(event.target.value)} value={lesson}><option value="">{t.matGeneral}</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
        <label><span>{t.matKind}</span><select onChange={(event) => setKind(event.target.value)} value={kind}><option value="">auto</option>{MATERIAL_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
      </div>
      {error && (
        <div className="mat-alert" role="alert">
          <strong>{error.title}</strong>
          <code>{error.code}</code>
          <span>{error.message}</span>
          {error.details.map((d) => <small key={d}>{d}</small>)}
        </div>
      )}
      <button className="primary-button" disabled={!file || busy} type="submit">
        {busy ? <span className="button-spinner" /> : <Icon name="arrow" size={16} />}
        {busy ? t.matUploading : t.matUpload}
      </button>
    </form>
  );
}

function MaterialEditor({ material, onSaved, onCancel, t }: { material: Material; onSaved: (m: Material) => void; onCancel: () => void; t: Translation }) {
  const [title, setTitle] = useState(material.title);
  const [lesson, setLesson] = useState(material.lesson ? String(material.lesson) : "");
  const [sortOrder, setSortOrder] = useState(material.sortOrder);
  const [error, setError] = useState("");
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      onSaved(await learning.update(material.id, { title: title.trim(), lesson: lesson ? Number(lesson) : null, sortOrder }));
    } catch (caught) {
      setError(errorText(caught));
    }
  };
  return (
    <form className="mat-editor" onSubmit={save}>
      <label><span>{t.matTitle}</span><input onChange={(event) => setTitle(event.target.value)} value={title} /></label>
      <label><span>{t.matLesson}</span><select onChange={(event) => setLesson(event.target.value)} value={lesson}><option value="">{t.matGeneral}</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
      <label><span>{t.matSortOrder}</span><input min="0" onChange={(event) => setSortOrder(Number(event.target.value))} type="number" value={sortOrder} /></label>
      {error && <small className="mat-inline-error">{error}</small>}
      <div><button onClick={onCancel} type="button">{t.cancel}</button><button className="primary-button" type="submit">{t.matSave}</button></div>
    </form>
  );
}

function MaterialCard({ material, admin, onOpen, onChanged, onDeleted, t }: { material: Material; admin: boolean; onOpen: () => void; onChanged: (m: Material) => void; onDeleted: () => void; t: Translation }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const settled = isSettled(material.status);
  const act = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
    } catch (caught) {
      setError(errorText(caught));
    }
  };
  return (
    <article className="mat-card" data-material-id={material.id}>
      <button className="mat-thumb" disabled={!settled || material.status === "FAILED"} onClick={onOpen} type="button" aria-label={`${t.matOpen}: ${material.title}`}>
        {material.links.thumbnail ? <img alt="" loading="lazy" src={learning.fileUrl(material.links.thumbnail)} /> : <span className={`file-icon file-${fileExt(material.originalFilename).toLowerCase()}`}>{fileExt(material.originalFilename)}</span>}
      </button>
      <div className="mat-card-body">
        <div className="mat-card-top">
          <MaterialStatusBadge status={material.status} t={t} />
          <span className="mat-kind"><Icon name={KIND_ICON[material.kind] ?? "compass"} size={12} />{material.kind}</span>
        </div>
        <h3>{material.title}</h3>
        <small>{fileExt(material.originalFilename)} · {sizeText(material.sizeBytes)}{material.pageCount ? ` · ${material.pageCount} ${t.pages}` : ""}{admin && material.uploadedBy ? ` · ${t.matUploadedBy}: ${material.uploadedBy}` : ""}</small>
        {material.status === "FAILED" && <small className="mat-inline-error">{t.matFailed}: {material.errorMessage}</small>}
        {material.status === "READY_NO_PREVIEW" && <small className="mat-inline-note">{t.matNoPreview}</small>}
        {error && <small className="mat-inline-error">{error}</small>}
        {editing ? (
          <MaterialEditor material={material} onCancel={() => setEditing(false)} onSaved={(m) => { setEditing(false); onChanged(m); }} t={t} />
        ) : (
          <div className="mat-card-actions">
            <button disabled={!settled || material.status === "FAILED"} onClick={onOpen} type="button"><Icon name="book" size={14} />{t.matOpen}</button>
            <a download href={learning.fileUrl(material.links.download)}><Icon name="arrow" size={14} />{t.download}</a>
            {admin && <button onClick={() => setEditing(true)} type="button"><Icon name="edit" size={14} />{t.matEdit}</button>}
            {admin && <button disabled={!settled} onClick={() => void act(async () => onChanged(await learning.reconvert(material.id)))} type="button"><Icon name="repeat" size={14} />{t.matReconvert}</button>}
            {admin && <button className="danger" disabled={!settled} onClick={() => setConfirming(true)} type="button"><Icon name="trash" size={14} />{t.matDelete}</button>}
          </div>
        )}
      </div>
      {confirming && (
        <ModalBackdrop onClose={() => setConfirming(false)}>
          <div className="delete-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-danger-icon"><Icon name="trash" size={22} /></div>
            <h2>{t.matDeleteConfirm}</h2>
            <strong>{material.title}</strong>
            <div className="modal-actions">
              <button onClick={() => setConfirming(false)} type="button">{t.cancel}</button>
              <button onClick={() => void act(async () => { await learning.remove(material.id); setConfirming(false); onDeleted(); })} type="button">{t.confirmDelete}</button>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </article>
  );
}

function MaterialViewer({ material, onBack, t }: { material: Material; onBack: () => void; t: Translation }) {
  const [pages, setPages] = useState<MaterialPage[]>([]);
  const [current, setCurrent] = useState(1);
  const [mode, setMode] = useState<"pages" | "pdf">(material.status === "READY" && material.pageCount ? "pages" : "pdf");

  // Səhifə şəkilləri pre-signed URL-lərlə (1 saat) — <img> Authorization başlığı göndərə bilmir
  useEffect(() => {
    learning.pages(material.id).then(setPages).catch(() => setPages([]));
  }, [material.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setCurrent((p) => Math.min(pages.length, p + 1));
      if (event.key === "ArrowLeft") setCurrent((p) => Math.max(1, p - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pages.length]);

  const page = pages.find((p) => p.pageNo === current);
  return (
    <section className="mat-viewer" aria-label={material.title}>
      <div className="mat-viewer-head">
        <button onClick={onBack} type="button"><Icon name="arrow" size={16} />{t.matBack}</button>
        <div><span>{t.lesson} {material.lesson ?? "—"}</span><h2>{material.title}</h2></div>
        <div className="mat-viewer-tabs" role="tablist">
          <button aria-selected={mode === "pages"} className={mode === "pages" ? "active" : ""} disabled={!pages.length} onClick={() => setMode("pages")} role="tab" type="button">{t.matPages}</button>
          <button aria-selected={mode === "pdf"} className={mode === "pdf" ? "active" : ""} disabled={!material.links.pdf} onClick={() => setMode("pdf")} role="tab" type="button">PDF</button>
          <a download href={learning.fileUrl(material.links.download)}><Icon name="arrow" size={14} />{t.download}</a>
        </div>
      </div>
      {mode === "pages" && pages.length > 0 ? (
        <div className="mat-viewer-body">
          <nav className="mat-page-nav" aria-label={t.matPages}>
            {pages.map((p) => (
              <button aria-current={p.pageNo === current ? "page" : undefined} className={p.pageNo === current ? "active" : ""} key={p.pageNo} onClick={() => setCurrent(p.pageNo)} type="button">
                <img alt="" loading="lazy" src={learning.fileUrl(p.thumbUrl)} />
                <span>{p.pageNo}</span>
              </button>
            ))}
          </nav>
          <div className="mat-page-stage">
            {page && <img alt={`${t.matPage} ${page.pageNo}`} src={learning.fileUrl(page.imageUrl)} />}
            <div className="mat-page-controls">
              <button disabled={current <= 1} onClick={() => setCurrent(current - 1)} type="button">{t.matPrev}</button>
              <span>{t.matPage} {current} / {pages.length}</span>
              <button disabled={current >= pages.length} onClick={() => setCurrent(current + 1)} type="button">{t.matNext}</button>
            </div>
          </div>
        </div>
      ) : material.links.pdf ? (
        <iframe className="mat-pdf" src={learning.fileUrl(material.links.pdf)} title={material.title} />
      ) : (
        <div className="mat-viewer-empty"><Icon name="book" size={26} /><p>{t.matNoPreview}</p><a className="primary-button" download href={learning.fileUrl(material.links.download)}>{t.download}</a></div>
      )}
    </section>
  );
}

function LessonTaskList({ tasks, onToggle, onOpen, t }: { tasks: LessonTask[]; onToggle: (task: LessonTask) => void; onOpen: (task: LessonTask) => void; t: Translation }) {
  const done = tasks.filter((task) => task.done).length;
  const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  return (
    <div className="mat-tasks">
      <div className="mat-tasks-head">
        <strong>{t.matLessonTasks}</strong>
        <span>{done} / {tasks.length} · {percent}%</span>
      </div>
      <div aria-label={`${percent}%`} className="mat-progress" role="progressbar" aria-valuemax={100} aria-valuemin={0} aria-valuenow={percent}><i style={{ width: `${percent}%` }} /></div>
      {tasks.length === 0 ? (
        <small className="mat-inline-note">{t.matNoTasks}</small>
      ) : (
        <div className="task-list">
          {tasks.map((task) => (
            <article className={task.done ? "complete" : ""} key={task.id}>
              <button aria-label={t.markComplete} aria-pressed={task.done} onClick={() => onToggle(task)} type="button">{task.done && <Icon name="check" size={15} />}</button>
              <span>{task.title} <code>{task.method} {task.path} → {task.expectedStatus}</code></span>
              <button onClick={() => onOpen(task)} type="button">{task.sqlCheck && task.done ? t.checkWithSql : t.openInExplorerTask}<Icon name="arrow" size={14} /></button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const MATERIALS_REFRESH_MS = 30_000;
const LESSON_FILTER_KEY = "api-lab-lesson-filter";
const validLesson = (value: string | null) => (value && ["1", "2", "3"].includes(value) ? Number(value) : null);
function storedLessonFilter(): number | null {
  const fromUrl = validLesson(new URLSearchParams(window.location.search).get("lesson"));
  if (fromUrl) return fromUrl;
  try {
    return validLesson(localStorage.getItem(LESSON_FILTER_KEY));
  } catch {
    return null;
  }
}
function rememberLessonFilter(lesson: number | null) {
  const url = new URL(window.location.href);
  if (lesson) url.searchParams.set("lesson", String(lesson));
  else url.searchParams.delete("lesson");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  try {
    if (lesson) localStorage.setItem(LESSON_FILTER_KEY, String(lesson));
    else localStorage.removeItem(LESSON_FILTER_KEY);
  } catch {
    // storage bloklanıbsa yalnız URL-də qalır
  }
}

function MaterialsPage({
  onNavigate,
  session,
  t,
}: {
  onNavigate: (page: Page) => void;
  session: AuthSession | null;
  t: Translation;
}) {
  const admin = session?.user.role === "admin";
  const [items, setItems] = useState<Material[]>([]);
  const [tasks, setTasks] = useState<LessonTask[]>([]);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  // QA-L03: dərs filteri URL-də (?lesson=2 — paylaşıla bilər) və localStorage-da yadda qalır
  const [lessonFilter, setLessonFilterState] = useState<number | null>(() => handoffs.take().lesson ?? storedLessonFilter());
  const setLessonFilter = (lesson: number | null) => {
    setLessonFilterState(lesson);
    rememberLessonFilter(lesson);
  };
  const [openId, setOpenId] = useState<number | null>(null);

  const load = async () => {
    try {
      const [materials, lessonTasks] = await Promise.all([learning.materials(), learning.tasks()]);
      setItems(materials);
      setTasks(lessonTasks);
      setLoadError("");
    } catch (error) {
      setLoadError(errorText(error));
    }
  };

  useEffect(() => {
    void load();
    rememberLessonFilter(lessonFilter); // handoff-dan gələn filter də URL-ə yazılsın
  }, []);

  // QA-L11: yeni hazır olan materiallar reload-suz görünsün — hər 30 san və vərəqə qayıdanda siyahı yenilənir
  // (yalnız materiallar; tapşırıqların optimistic vəziyyətinə toxunulmur)
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") learning.materials().then(setItems).catch(() => undefined);
    };
    const timer = window.setInterval(refresh, MATERIALS_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  // 202 Accepted-dən sonra polling: UPLOADED / CONVERTING → READY | READY_NO_PREVIEW | FAILED
  const pending = items.filter((m) => !isSettled(m.status)).map((m) => m.id).join(",");
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(async () => {
      const ids = pending.split(",").map(Number);
      const fresh = await Promise.all(ids.map((id) => learning.material(id).catch(() => null)));
      setItems((list) => list.map((m) => fresh.find((f) => f?.id === m.id) ?? m));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [pending]);

  const upsert = (m: Material) => setItems((list) => (list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m]));

  // PUT /api/v1/tasks/{id}/progress — optimistic yeniləmə, xətada geri qaytarılır
  const toggleTask = async (task: LessonTask) => {
    const done = !task.done;
    setTasks((list) => list.map((item) => (item.id === task.id ? { ...item, done } : item)));
    try {
      await learning.setDone(task.id, done);
    } catch {
      setTasks((list) => list.map((item) => (item.id === task.id ? { ...item, done: task.done } : item)));
    }
  };

  const openTask = (task: LessonTask) => {
    if (task.sqlCheck && task.done) {
      handoffs.set({ sql: task.sqlCheck });
      onNavigate("sql");
    } else {
      handoffs.set({ explorer: { method: task.method, path: task.path } });
      onNavigate("explorer");
    }
  };

  const term = query.trim().toLowerCase();
  const visible = items
    .filter((m) => !term || `${m.title} ${m.originalFilename} ${m.description ?? ""}`.toLowerCase().includes(term))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const groups = ([1, 2, 3, null] as (number | null)[])
    .filter((lesson) => lessonFilter === null || lesson === lessonFilter)
    .map((lesson) => ({ lesson, materials: visible.filter((m) => m.lesson === lesson), tasks: lesson ? tasks.filter((task) => task.lesson === lesson) : [] }))
    .filter((group) => group.lesson !== null || group.materials.length > 0);
  const completed = tasks.filter((task) => task.done).length;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const opened = items.find((m) => m.id === openId);

  if (opened) {
    return (
      <main className="materials-page" id="main-content">
        <MaterialViewer material={opened} onBack={() => setOpenId(null)} t={t} />
      </main>
    );
  }

  return (
    <main className="materials-page" id="main-content">
      <div className="materials-hero">
        <div><span className="section-kicker"><Icon name="book" size={16} />{t.learningHub}</span><h1>{t.materialsTitle}</h1><p>{loadError || t.materialsSubtitle}</p></div>
        <div className="course-progress"><div><span>{t.courseProgress}</span><strong>{progress}%</strong></div><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><small>{completed} / {tasks.length} {t.completedTasks}</small></div>
      </div>

      <div className="mat-toolbar">
        <label className="mat-search">
          <Icon name="search" size={16} />
          <span className="sr-only">{t.matSearch}</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder={t.matSearch} type="search" value={query} />
        </label>
        <div className="mat-lesson-filter" role="group" aria-label={t.matLesson}>
          {([null, 1, 2, 3] as (number | null)[]).map((lesson) => (
            <button className={lessonFilter === lesson ? "active" : ""} key={String(lesson)} onClick={() => setLessonFilter(lesson)} type="button">{lesson === null ? t.matAll : `${t.lesson} ${lesson}`}</button>
          ))}
        </div>
        <a className="mat-toolbar-link" download href={learning.fileUrl("/api/postman/collection.json")}><Icon name="arrow" size={15} />{t.postmanCollection}</a>
      </div>

      {admin && <MaterialUploader onUploaded={upsert} t={t} />}

      {groups.map((group) => (
        <section className="materials-section mat-lesson" data-lesson={group.lesson ?? "general"} key={String(group.lesson)}>
          <div className="materials-section-head">
            <h2>{group.lesson ? `${t.lesson} ${group.lesson}` : t.matGeneral}</h2>
            <span>{group.materials.length} {t.materialsCount}</span>
          </div>
          <div className="mat-lesson-layout">
            <div className="mat-grid">
              {group.materials.length === 0 ? (
                <div className="mat-empty">{term ? t.noResults : t.matEmpty}</div>
              ) : (
                group.materials.map((m) => (
                  <MaterialCard admin={admin} key={m.id} material={m} onChanged={upsert} onDeleted={() => setItems((list) => list.filter((x) => x.id !== m.id))} onOpen={() => setOpenId(m.id)} t={t} />
                ))
              )}
            </div>
            {group.lesson !== null && <LessonTaskList onOpen={openTask} onToggle={(task) => void toggleTask(task)} t={t} tasks={group.tasks} />}
          </div>
        </section>
      ))}
    </main>
  );
}

// URL → ilkin vəziyyət: qorunan səhifə sessiyasız açılırsa sign-in, sonra ora qayıdılır
function initialRoute(hasSession: boolean) {
  const route = parseRoute(window.location.pathname);
  if (PROTECTED_PAGES.includes(route.page) && !hasSession) return { page: "signin" as Page, app: null, intended: route };
  return { page: route.page, app: route.app, intended: { page: "home" as Page, app: null } };
}

function App() {
  const [language, setLanguage] = useState<Language>(storedLanguage);
  const [session, setSession] = useState<AuthSession | null>(() =>
    authClient.getStoredSession(),
  );
  const [initial] = useState(() => initialRoute(Boolean(authClient.getStoredSession())));
  const [currentPage, setCurrentPage] = useState<Page>(initial.page);
  const [currentApp, setCurrentApp] = useState<AppId | null>(initial.app);
  const [intendedPage, setIntendedPage] = useState<{ page: Page; app: AppId | null }>(initial.intended);
  // Qorunan link sessiyasız açılıbsa URL də /signin olsun (girişdən sonra intendedPage-ə qayıdılır)
  useEffect(() => {
    if (initial.page === "signin" && window.location.pathname !== "/signin") window.history.replaceState({}, "", "/signin");
  }, [initial]);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [refreshingSession, setRefreshingSession] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("api-lab-theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [data, setData] = useState<HomeData | null>(null);
  const [lessonsDone, setLessonsDone] = useState(0);
  const [lessonProgress, setLessonProgress] = useState<LessonProgress["byLesson"]>([]);
  const t = translations[language];

  // auth.ts sessiyanı dəyişəndə (refresh, refresh uğursuz → çıxış) state-i yenilə
  useEffect(() => onSessionChange(setSession), []);

  // Dərs irəliləyişi: bütün tapşırıqları bitmiş dərslərin sayı (GET /api/v1/tasks/progress/me)
  useEffect(() => {
    if (!session) {
      setLessonsDone(0);
      setLessonProgress([]);
      return;
    }
    learning
      .progress()
      .then((p) => {
        setLessonProgress(p.byLesson);
        setLessonsDone(p.byLesson.filter((l) => l.total > 0 && l.done === l.total).length);
      })
      .catch(() => setLessonsDone(0));
  }, [session]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("api-lab-theme", theme);
  }, [theme]);

  useEffect(() => {
    apiClient.getHomeData().then(setData).catch(() => setData(null));
  }, []);

  useEffect(() => {
    // Brauzerin Geri/İrəli düymələri: URL-dən səhifə (qorunan səhifə sessiyasız → sign-in)
    const handlePopState = () => {
      const route = parseRoute(window.location.pathname);
      if (PROTECTED_PAGES.includes(route.page) && !session) {
        setIntendedPage(route);
        setCurrentPage("signin");
        return;
      }
      setCurrentPage(route.page === "signin" && session ? "home" : route.page);
      setCurrentApp(route.app);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [session]);

  useEffect(() => {
    if (session && currentPage === "signin") {
      setCurrentPage("home");
      window.history.replaceState({}, "", "/");
    }
  }, [currentPage, session]);

  // QA-M03: ekran oxuyucuları üçün səhifənin dili; QA-L02: seçim yadda qalır
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // storage bloklanıbsa dil yalnız bu sessiyada qalır
    }
  }, [language]);

  useEffect(() => {
    if (!session) {
      setSessionExpired(false);
      return;
    }
    const update = () => setSessionExpired(session.expiresAt <= Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [session]);

  const navigateTo = (page: Page, app: AppId | null = null) => {
    if (PROTECTED_PAGES.includes(page) && !session) {
      setIntendedPage({ page, app });
      setCurrentPage("signin");
      window.history.pushState({}, "", pathOf("signin"));
      return;
    }
    setCurrentPage(page);
    setCurrentApp(app);
    const path = pathOf(page, app);
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
  };

  const completeSignIn = (nextSession: AuthSession) => {
    const destination = intendedPage.page === "signin" ? { page: "home" as Page, app: null } : intendedPage;
    setSession(nextSession);
    setSessionExpired(false);
    setCurrentPage(destination.page);
    setCurrentApp(destination.app);
    setIntendedPage({ page: "home", app: null });
    window.history.replaceState({}, "", pathOf(destination.page, destination.app));
  };

  const signOut = () => {
    void authClient.signOut();
    setSession(null);
    setCurrentPage("home");
    setCurrentApp(null);
    setIntendedPage({ page: "home", app: null });
    window.history.replaceState({}, "", "/");
  };

  const refreshExpiredSession = async () => {
    setRefreshingSession(true);
    try {
      const refreshed = await authClient.refreshSession();
      setSession(refreshed);
      setSessionExpired(false);
    } catch {
      // Refresh token yoxdur / ləğv edilib → yenidən daxil olmaq lazımdır
      setSession(null);
      navigateTo("signin");
    } finally {
      setRefreshingSession(false);
    }
  };

  // Dərs kartlarının meta sətri real irəliləyişdən: "2 / 4 tapşırıq" (login olmayanda — statik təsvir)
  const lessonMeta = (lesson: number, fallback: string) => {
    const p = lessonProgress.find((l) => l.lesson === lesson);
    return p ? `${p.done} / ${p.total} ${t.tasksLabel}` : fallback;
  };
  const lessons = [
    { title: t.lesson1Title, description: t.lesson1Description, meta: lessonMeta(1, t.lesson1Meta) },
    { title: t.lesson2Title, description: t.lesson2Description, meta: lessonMeta(2, t.lesson2Meta) },
    { title: t.lesson3Title, description: t.lesson3Description, meta: lessonMeta(3, t.lesson3Meta) },
  ];

  return (
    <div className="app" id="top">
      <a className="skip-link" href="#main-content">
        {t.skipToContent}
      </a>
      <Header
        language={language}
        setLanguage={setLanguage}
        theme={theme}
        setTheme={setTheme}
        currentPage={currentPage}
        session={session}
        onNavigate={navigateTo}
        onSignOut={signOut}
        t={t}
      />

      {session && sessionExpired && (
        <div className="session-expired-banner" role="alert">
          <Icon name="lock" size={18} />
          <strong>{t.sessionExpired}</strong>
          <button
            disabled={refreshingSession}
            onClick={refreshExpiredSession}
            type="button"
          >
            {refreshingSession && <span className="button-spinner" />}
            {t.refreshSession}
          </button>
        </div>
      )}

      {currentPage === "home" ? (
      <main id="main-content">
        <section className="hero">
          <div className="hero-grid">
            <div className="hero-content">
              <div className="eyebrow">
                <span className="eyebrow-dot" />
                {t.eyebrow}
              </div>
              <h1>{t.heroTitle}</h1>
              <p className="hero-description">{t.heroDescription}</p>
              <div className="hero-actions">
                <a
                  className="primary-button"
                  href={session ? "#lessons" : "/signin"}
                  onClick={(event) => {
                    if (session) return;
                    event.preventDefault();
                    navigateTo("explorer");
                  }}
                >
                  {t.startLearning}
                  <Icon name="arrow" size={19} />
                </a>
                <a
                  className="secondary-button"
                  href="/explorer"
                  onClick={(event) => {
                    event.preventDefault();
                    navigateTo("explorer");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <Icon name="code" size={19} />
                  {t.openExplorer}
                </a>
              </div>
              <div className="hero-meta">
                <span>
                  <Icon name="book" size={17} />
                  {t.learningPath}
                </span>
                <span>
                  <Icon name="check" size={17} />
                  {t.statusReady}
                  {data && ` · ${data.stats.endpoints} endpoint · v${data.stats.version}`}
                </span>
              </div>
            </div>

            <div className="request-window" aria-label={t.practiceLabel}>
              <div className="window-bar">
                <div className="window-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
                <span>api-lab / explorer</span>
                <span className="live-pill">
                  <i />
                  {t.live}
                </span>
              </div>
              <div className="request-body">
                <div className="request-label">{t.practiceLabel}</div>
                <div className="request-line">
                  <span className="method-badge get">{data?.sample.method ?? "GET"}</span>
                  <code>{data?.sample.path ?? "/api/v1/health"}</code>
                  <button className="send-button" type="button" aria-label={t.sendRequest}>
                    <Icon name="play" size={16} />
                  </button>
                </div>
                <div className="response-block">
                  <div className="response-head">
                    <span>Response</span>
                    <span className="status-chip">{data ? `${data.sample.status} OK` : "…"}</span>
                  </div>
                  <pre>
                    <span className="code-brace">{"{"}</span>
                    {Object.entries(data?.sample.body ?? {}).map(([key, value], index, all) => (
                      <span key={key}>
                        {"\n  "}<span className="code-key">"{key}"</span>: {typeof value === "number" ? <span className="code-number">{value}</span> : <span className="code-string">"{String(value)}"</span>}{index < all.length - 1 ? "," : ""}
                      </span>
                    ))}
                    {"\n"}<span className="code-brace">{"}"}</span>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="content-shell">
          <section className="base-url-card" aria-labelledby="base-url-title">
            <div className="base-url-icon">
              <Icon name="globe" size={24} />
            </div>
            <div className="base-url-copy">
              <h2 id="base-url-title">{t.baseUrl}</h2>
              <p>{t.baseUrlDescription}</p>
            </div>
            <div className="url-field">
              <code>{data?.baseUrl ?? t.loading}</code>
              {data && (
                <CopyButton
                  value={data.baseUrl}
                  label={t.copy}
                  copiedLabel={t.copied}
                  compact
                />
              )}
            </div>
          </section>

          <section className="section-block" aria-labelledby="users-title">
            <div className="section-heading">
              <div>
                <span className="section-kicker">
                  <Icon name="users" size={16} />
                  {t.sandbox}
                </span>
                <h2 id="users-title">{t.demoUsers}</h2>
                <p>{t.demoUsersDescription}</p>
              </div>
              <span className="account-count">{t.accounts}</span>
            </div>
            <div className="table-card">
              <div aria-label={t.demoUsers} className="table-scroll" role="region" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th>{t.username}</th>
                      <th>{t.password}</th>
                      <th>{t.role}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.users.map((user) => (
                      <tr key={user.username}>
                        <td>
                          <span className="table-avatar">{user.username.slice(0, 2).toUpperCase()}</span>
                          <code>{user.username}</code>
                        </td>
                        <td>
                          <code>{user.password}</code>
                        </td>
                        <td>
                          <span className={`role-chip role-${user.role}`}>
                            {user.role === "admin" ? t.administrator : t.student}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="section-block" id="lessons" aria-labelledby="lessons-title">
            <div className="section-heading">
              <div>
                <span className="section-kicker">
                  <Icon name="book" size={16} />
                  {t.curriculum}
                </span>
                <h2 id="lessons-title">{t.lessons}</h2>
                <p>{t.lessonsDescription}</p>
              </div>
              <div className="progress-label">
                <span>{lessonsDone} / 3</span>
                <div><i style={{ width: `${(lessonsDone / 3) * 100}%` }} /></div>
              </div>
            </div>
            <div className="lesson-grid">
              {lessons.map((lesson, index) => (
                <article className="lesson-card" key={lesson.title}>
                  <div className="lesson-top">
                    <div className={`lesson-icon lesson-icon-${index + 1}`}>
                      <Icon name={lessonIcons[index]} size={22} />
                    </div>
                    <span className={`method-badge method-${index + 1}`}>
                      {lessonMethods[index]}
                    </span>
                  </div>
                  <span className="lesson-number">
                    {t.lesson} {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3>{lesson.title}</h3>
                  <p>{lesson.description}</p>
                  <div className="lesson-footer">
                    <span>{lesson.meta}</span>
                    <a
                      aria-label={`${t.continueLesson}: ${lesson.title}`}
                      href="/materials"
                      onClick={(event) => {
                        event.preventDefault();
                        handoffs.set({ lesson: index + 1 });
                        navigateTo("materials");
                      }}
                    >
                      <span>{t.continueLesson}</span>
                      <Icon name="arrow" size={17} />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="quick-start" id="quick-start" aria-labelledby="quick-start-title">
            <div className="quick-start-copy">
              <span className="section-kicker section-kicker--light">
                <Icon name="code" size={16} />
                {t.quickStartKicker}
              </span>
              <h2 id="quick-start-title">{t.quickStart}</h2>
              <p>{t.quickStartDescription}</p>
              <div className="tip-row">
                <Icon name="check" size={18} />
                <span>{t.practiceValue}</span>
              </div>
            </div>
            <div className="terminal">
              <div className="terminal-head">
                <div className="terminal-title">
                  <span className="terminal-prompt">$</span>
                  <span>{t.terminal}</span>
                </div>
                {data && (
                  <CopyButton
                    value={data.curl}
                    label={t.copyCode}
                    copiedLabel={t.copied}
                    compact
                  />
                )}
              </div>
              <pre><span>curl</span> -s \{"\n  "}<span className="terminal-url">"{data?.baseUrl ?? "..."}/currencies/rates?base=AZN"</span> \{"\n  "}-H <span className="terminal-string">"X-API-Key: apilab-demo-key-2026"</span></pre>
              <div className="terminal-response">
                <span>{t.responsePreview}</span>
                <strong>{t.responseReady}</strong>
              </div>
            </div>
          </section>
        </div>
      </main>
      ) : currentPage === "signin" ? (
        <SignInPage onSignedIn={completeSignIn} t={t} />
      ) : currentPage === "explorer" ? (
        <ExplorerPage t={t} />
      ) : currentPage === "apps" ? (
        <AppsPage appId={currentApp} onSelectApp={(app) => navigateTo("apps", app)} onOpenExplorer={() => navigateTo("explorer")} t={t} />
      ) : currentPage === "auth" ? (
        <AuthLabPage t={t} />
      ) : currentPage === "sql" ? (
        <SqlPlaygroundPage t={t} />
      ) : (
        <MaterialsPage onNavigate={navigateTo} session={session} t={t} />
      )}

      <footer>
        <div className="footer-inner">
          <a aria-label="API Lab" className="brand brand--footer" href="/" onClick={(event) => { event.preventDefault(); navigateTo("home"); window.scrollTo({ top: 0 }); }}>
            <span className="brand-mark"><Icon name="code" size={18} /></span>
            <span>API Lab</span>
          </a>
          <p>{t.footerText}</p>
          <span>{t.copyright}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;

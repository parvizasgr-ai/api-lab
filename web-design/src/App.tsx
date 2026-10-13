import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  authClient,
  AuthClientError,
  type AuthSession,
  type GoogleAccount,
} from "./api/auth";
import {
  apiClient,
  type ExplorerResponse,
  type HomeData,
  type NetworkCall,
} from "./lib/api";

type Language = "az" | "en";
type Theme = "light" | "dark";
type Page =
  | "home"
  | "explorer"
  | "apps"
  | "auth"
  | "sql"
  | "materials"
  | "signin";

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
    instructor: "Təlimçi",
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
    loading: "Məlumat yüklənir",
    beta: "BETA",
    live: "AKTİV",
    sendRequest: "Request göndər",
    sandbox: "SANDBOX",
    curriculum: "PROQRAM",
    accounts: "3 HESAB",
    quickStartKicker: "SÜRƏTLİ BAŞLANĞIC",
    terminal: "Terminal",
    copyright: "© 2025 API Lab",
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
    instructor: "Instructor",
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
    loading: "Loading data",
    beta: "BETA",
    live: "LIVE",
    sendRequest: "Send request",
    sandbox: "SANDBOX",
    curriculum: "CURRICULUM",
    accounts: "3 ACCOUNTS",
    quickStartKicker: "QUICK START",
    terminal: "Terminal",
    copyright: "© 2025 API Lab",
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
        <a className="brand" href="#top" aria-label="API Lab Home" onClick={() => navigate("home")}>
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
              href={item.page ? `#${item.page}` : "#"}
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
                        {session.user.role === "student"
                          ? t.student
                          : session.user.role === "admin"
                            ? t.administrator
                            : t.instructor}
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
              href={item.page ? `#${item.page}` : "#"}
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
type ResponseTab = "pretty" | "raw" | "headers";
type ExplorerPanel = "endpoints" | "request" | "response";

type HistoryItem = {
  id: number;
  method: string;
  url: string;
  status: number;
  time: number;
};

function StatusChip({ status }: { status: number }) {
  return (
    <span className={`explorer-status status-${Math.floor(status / 100)}xx`}>
      {status}
    </span>
  );
}

function ExplorerPage({ t }: { t: Translation }) {
  const baseUrl = "https://api.apilab.az/v1";
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState(`${baseUrl}/users`);
  const [requestTab, setRequestTab] = useState<RequestTab>("params");
  const [responseTab, setResponseTab] = useState<ResponseTab>("pretty");
  const [mobilePanel, setMobilePanel] = useState<ExplorerPanel>("request");
  const [authType, setAuthType] = useState("none");
  const [body, setBody] = useState(
    '{\n  "name": "Aylin",\n  "role": "student"\n}',
  );
  const [response, setResponse] = useState<ExplorerResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const groups = [
    {
      label: t.usersTag,
      endpoints: [
        { method: "GET", path: "/users", label: t.listUsers },
        { method: "GET", path: "/users/:id", label: t.getUser },
        { method: "POST", path: "/users", label: t.createUser },
      ],
    },
    {
      label: t.authTag,
      endpoints: [
        { method: "POST", path: "/auth/login", label: t.loginUser },
        { method: "POST", path: "/auth/refresh", label: t.refreshToken },
      ],
    },
    {
      label: t.systemTag,
      endpoints: [
        { method: "GET", path: "/rate-limit", label: t.rateLimitTest },
        { method: "GET", path: "/broken", label: t.triggerError },
      ],
    },
  ];

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

  const selectEndpoint = (nextMethod: string, path: string) => {
    setMethod(nextMethod);
    setUrl(`${baseUrl}${path.replace(":id", "1")}`);
    setResponse(null);
    setMobilePanel("request");
    if (nextMethod === "POST") setRequestTab("body");
  };

  const sendRequest = async () => {
    setIsLoading(true);
    setResponse(null);
    setMobilePanel("response");
    const result = await apiClient.sendExplorerRequest({ method, url, body });
    setResponse(result);
    setIsLoading(false);
    setCountdown(result.retryAfter ?? 0);
    setHistory((items) =>
      [
        {
          id: Date.now(),
          method,
          url,
          status: result.status,
          time: result.time,
        },
        ...items,
      ].slice(0, 8),
    );
  };

  const curl = `curl -X ${method} "${url}" -H "Accept: application/json"`;
  const requestTabs: { id: RequestTab; label: string }[] = [
    { id: "params", label: t.params },
    { id: "headers", label: t.headers },
    { id: "auth", label: t.auth },
    { id: "body", label: t.body },
    { id: "tests", label: t.tests },
  ];
  const responseTabs: { id: ResponseTab; label: string }[] = [
    { id: "pretty", label: t.pretty },
    { id: "raw", label: t.raw },
    { id: "headers", label: t.headers },
  ];

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
              <small>7 ENDPOINTS</small>
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
              <div className="tree-empty">{t.noEndpoints}</div>
            ) : (
              filteredGroups.map((group) => (
                <div className="endpoint-group" key={group.label}>
                  <div className="endpoint-group-title">
                    <Icon name="chevron" size={14} />
                    <span>{group.label}</span>
                    <small>{group.endpoints.length}</small>
                  </div>
                  {group.endpoints.map((endpoint) => {
                    const active =
                      method === endpoint.method &&
                      url === `${baseUrl}${endpoint.path.replace(":id", "1")}`;
                    return (
                      <button
                        className={active ? "endpoint-item active" : "endpoint-item"}
                        key={`${endpoint.method}-${endpoint.path}`}
                        onClick={() => selectEndpoint(endpoint.method, endpoint.path)}
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
                {(tab.id === "params" || tab.id === "headers") && <span>1</span>}
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
                <div className="kv-row">
                  <input aria-label={t.key} defaultValue={requestTab === "params" ? "page" : "Accept"} />
                  <input aria-label={t.value} defaultValue={requestTab === "params" ? "1" : "application/json"} />
                  <input aria-label={t.description} placeholder="—" />
                </div>
                <button className="add-row-button" type="button">
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
                      placeholder={t.tokenPlaceholder}
                      type={authType === "basic" ? "password" : "text"}
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
                  defaultValue={t.testsPlaceholder}
                  spellCheck="false"
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
          ) : response.errorCode ? (
            <div className="response-error">
              <div className="error-mark">!</div>
              <h3>{t.errorTitle}</h3>
              <p>{String(response.body.message)}</p>
              <dl>
                <div><dt>{t.errorCode}</dt><dd>{response.errorCode}</dd></div>
                <div><dt>{t.traceId}</dt><dd>{response.traceId}</dd></div>
              </dl>
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
              <pre className="response-code">
                {responseTab === "headers"
                  ? Object.entries(response.headers)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join("\n")
                  : responseTab === "raw"
                    ? JSON.stringify(response.body)
                    : JSON.stringify(response.body, null, 2)}
              </pre>
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
            <button onClick={() => setHistory([])} type="button">{t.clearHistory}</button>
          )}
        </div>
        <div className="history-card">
          {history.length === 0 ? (
            <div className="history-empty">{t.noHistory}</div>
          ) : (
            <div className="table-scroll">
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
                      <td><code>{item.url.replace(baseUrl, "")}</code></td>
                      <td><StatusChip status={item.status} /></td>
                      <td><span className="history-time">{item.time} ms · {t.justNow}</span></td>
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

type AppId =
  | "bank"
  | "currency"
  | "flights"
  | "hotels"
  | "books"
  | "music"
  | "google"
  | "customers";

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

function BankApp({
  addCall,
  t,
}: {
  addCall: (call: NetworkCall) => void;
  t: Translation;
}) {
  const [blockModal, setBlockModal] = useState(false);
  const [blockReason, setBlockReason] = useState("LOST");
  const [blocked, setBlocked] = useState(false);
  const [transferSent, setTransferSent] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(
    () => `idem_${crypto.randomUUID().slice(0, 18)}`,
  );

  const blockCard = () => {
    setBlocked(true);
    setBlockModal(false);
    addCall({
      id: `block-${Date.now()}`,
      method: "POST",
      url: "/v1/cards/card_4821/block",
      status: 200,
      time: 118,
    });
  };

  const transfer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTransferSent(true);
    addCall({
      id: `transfer-${Date.now()}`,
      method: "POST",
      url: "/bff/transfers",
      status: 201,
      time: 284,
      type: "BFF",
      internalCalls: [
        {
          id: "transfer-check",
          method: "GET",
          url: "/accounts/acc_001/balance",
          status: 200,
          time: 38,
        },
        {
          id: "transfer-create",
          method: "POST",
          url: "/transfers",
          status: 201,
          time: 176,
        },
      ],
    });
    setIdempotencyKey(`idem_${crypto.randomUUID().slice(0, 18)}`);
    window.setTimeout(() => setTransferSent(false), 2600);
  };

  return (
    <div className="bank-app">
      <div className="bank-summary">
        <div>
          <span>{t.totalBalance}</span>
          <strong>₼ 24,840.65</strong>
          <small>{t.acrossAccounts}</small>
        </div>
        <div className="balance-spark" aria-hidden="true">
          <svg viewBox="0 0 180 55">
            <path d="M2 45 C25 46 24 29 47 34 S72 19 92 25 S116 9 135 17 S158 6 178 8" />
          </svg>
          <span>+8.4%</span>
        </div>
      </div>

      <section className="bank-section">
        <div className="app-section-title">
          <h2>{t.accountsLabel}</h2>
          <span>3</span>
        </div>
        <div className="account-grid">
          {[
            [t.checking, "AZN", "₼ 8,420.35", "•• 2048"],
            [t.savings, "USD", "$ 6,240.00", "•• 7182"],
            [t.business, "EUR", "€ 9,180.30", "•• 9014"],
          ].map(([name, currency, amount, number]) => (
            <article className="account-card" key={name}>
              <div><span>{name}</span><b>{currency}</b></div>
              <strong>{amount}</strong>
              <small>{t.availableBalance} · {number}</small>
            </article>
          ))}
        </div>
      </section>

      <div className="bank-content-grid">
        <section className="bank-section">
          <div className="app-section-title">
            <h2>{t.cardsLabel}</h2>
            <span>2</span>
          </div>
          <div className="payment-cards">
            <article className={blocked ? "payment-card visa blocked" : "payment-card visa"}>
              <div className="payment-card-top">
                <span className="card-chip" />
                <b>VISA</b>
              </div>
              <code>••••  ••••  ••••  4821</code>
              <div className="payment-card-bottom">
                <span>RAUF MAMMADOV</span>
                <span>{t.expires}<b>08/28</b></span>
                <strong>{blocked ? t.blocked : t.active}</strong>
              </div>
              {!blocked && (
                <button onClick={() => setBlockModal(true)} type="button">
                  <Icon name="lock" size={14} />
                  {t.blockCard}
                </button>
              )}
              {blocked && <div className="blocked-overlay"><Icon name="lock" size={24} />{t.cardBlocked}</div>}
            </article>
            <article className="payment-card mastercard">
              <div className="payment-card-top">
                <span className="card-chip" />
                <b>MASTERCARD</b>
              </div>
              <code>••••  ••••  ••••  1093</code>
              <div className="payment-card-bottom">
                <span>RAUF MAMMADOV</span>
                <span>{t.expires}<b>11/27</b></span>
                <strong>{t.active}</strong>
              </div>
            </article>
          </div>
        </section>

        <section className="bank-section transfer-section">
          <div className="app-section-title">
            <h2>{t.transferMoney}</h2>
          </div>
          <form className="transfer-form" onSubmit={transfer}>
            <label>
              <span>{t.fromAccount}</span>
              <select><option>{t.checking} · ₼ 8,420.35</option></select>
            </label>
            <label>
              <span>{t.recipientIban}</span>
              <input defaultValue="AZ21 NABZ 0000 0012 3456 7890 12" required />
            </label>
            <div className="transfer-split">
              <label><span>{t.amount}</span><input defaultValue="125.00" type="number" required /></label>
              <label><span>{t.transferNote}</span><input defaultValue="Course payment" /></label>
            </div>
            <div className="idempotency-field">
              <div>
                <span>{t.idempotencyKey}</span>
                <small>{t.idempotencyHint}</small>
              </div>
              <code>{idempotencyKey}</code>
            </div>
            <button className={transferSent ? "transfer-button success" : "transfer-button"} type="submit">
              <Icon name={transferSent ? "check" : "arrow"} size={17} />
              {transferSent ? t.transferComplete : t.sendTransfer}
            </button>
          </form>
        </section>
      </div>

      <section className="bank-section activity-section">
        <div className="app-section-title"><h2>{t.recentActivity}</h2><span>{t.today}</span></div>
        <div className="activity-row">
          <span className="activity-icon"><Icon name="card" size={17} /></span>
          <div><strong>{t.cardPayment}</strong><small>API Lab Coffee · VISA •4821</small></div>
          <b>− ₼ 8.50</b>
        </div>
        <div className="activity-row">
          <span className="activity-icon incoming"><Icon name="arrow" size={17} /></span>
          <div><strong>{t.salary}</strong><small>Acme Education LLC</small></div>
          <b className="positive">+ ₼ 2,450.00</b>
        </div>
      </section>

      {blockModal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setBlockModal(false)}>
          <div
            aria-labelledby="block-card-title"
            aria-modal="true"
            className="block-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-danger-icon"><Icon name="lock" size={23} /></div>
            <h2 id="block-card-title">{t.blockCardTitle}</h2>
            <p>{t.blockCardText}</p>
            <label>
              <span>{t.reason}</span>
              <select value={blockReason} onChange={(event) => setBlockReason(event.target.value)}>
                <option>{t.lost}</option>
                <option>{t.stolen}</option>
                <option>{t.suspectedFraud}</option>
              </select>
            </label>
            <label>
              <span>{t.comment}</span>
              <textarea placeholder={t.commentPlaceholder} />
            </label>
            <div className="modal-actions">
              <button onClick={() => setBlockModal(false)} type="button">{t.cancel}</button>
              <button onClick={blockCard} type="button">{t.confirmBlock}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CurrencyApp({
  addCall,
  t,
}: {
  addCall: (call: NetworkCall) => void;
  t: Translation;
}) {
  const [from, setFrom] = useState("AZN");
  const [to, setTo] = useState("USD");
  const [amount, setAmount] = useState(1000);
  const rates: Record<string, number> = { AZN: 1, USD: 0.5882, EUR: 0.5418, GBP: 0.463 };
  const converted = ((amount / rates[from]) * rates[to]).toFixed(2);

  const swap = () => {
    setFrom(to);
    setTo(from);
    addCall({
      id: `rate-${Date.now()}`,
      method: "GET",
      url: `/v1/rates?base=${to}&symbols=${from}`,
      status: 200,
      time: 47,
    });
  };

  return (
    <div className="currency-app">
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
                {Object.keys(rates).map((rate) => <option key={rate}>{rate}</option>)}
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
                {Object.keys(rates).map((rate) => <option key={rate}>{rate}</option>)}
              </select>
            </div>
          </div>
          <div className="rate-summary">
            <span>{t.exchangeRate}</span>
            <strong>1 {from} = {(rates[to] / rates[from]).toFixed(4)} {to}</strong>
            <small>{t.rateDisclaimer}</small>
          </div>
        </section>

        <section className="trend-card">
          <div className="trend-head">
            <div><span>{t.marketTrend}</span><h2>{from} / {to}</h2></div>
            <span className="trend-up">+1.24%</span>
          </div>
          <div className="trend-value">
            <strong>{(rates[to] / rates[from]).toFixed(4)}</strong>
            <small>{t.updatedNow}</small>
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
              <path className="chart-area" d="M0 184 C45 170 64 190 105 150 S172 145 208 116 S277 132 318 87 S390 110 432 71 S510 80 600 26 L600 230 L0 230Z" />
              <path className="chart-line" d="M0 184 C45 170 64 190 105 150 S172 145 208 116 S277 132 318 87 S390 110 432 71 S510 80 600 26" />
              <circle cx="600" cy="26" r="6" />
            </svg>
            <div className="chart-labels"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
          </div>
          <div className="trend-stats">
            <div><span>{t.low}</span><strong>0.5741</strong></div>
            <div><span>{t.high}</span><strong>0.5912</strong></div>
            <div><span>{t.exchangeRate}</span><strong>0.5882</strong></div>
          </div>
        </section>
      </div>
    </div>
  );
}

function FlightsApp({
  addCall,
  t,
}: {
  addCall: (call: NetworkCall) => void;
  t: Translation;
}) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recommended");
  const [selectedFlight, setSelectedFlight] = useState<{
    airline: string;
    code: string;
    depart: string;
    arrive: string;
    duration: string;
    stops: number;
    price: number;
  } | null>(null);
  const [booked, setBooked] = useState(false);
  const flights = [
    { airline: "AZAL", code: "J2 075", depart: "09:15", arrive: "12:10", duration: "4h 55m", stops: 0, price: 428 },
    { airline: "Turkish Airlines", code: "TK 333", depart: "11:40", arrive: "16:55", duration: "6h 15m", stops: 1, price: 365 },
    { airline: "Qatar Airways", code: "QR 354", depart: "14:20", arrive: "18:35", duration: "5h 15m", stops: 0, price: 492 },
  ];
  const visibleFlights = flights
    .filter((flight) =>
      filter === "direct" ? flight.stops === 0 : filter === "stop" ? flight.stops === 1 : true,
    )
    .sort((a, b) =>
      sort === "price"
        ? a.price - b.price
        : sort === "duration"
          ? Number.parseInt(a.duration) - Number.parseInt(b.duration)
          : a.stops - b.stops,
    );

  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addCall({
      id: `flight-search-${Date.now()}`,
      method: "GET",
      url: "/bff/flights/search?from=GYD&to=IST",
      status: 200,
      time: 436,
      type: "BFF",
      internalCalls: [
        { id: "azal-search", method: "GET", url: "/providers/azal/offers", status: 200, time: 146 },
        { id: "tk-search", method: "GET", url: "/providers/tk/offers", status: 200, time: 182 },
        { id: "qr-search", method: "GET", url: "/providers/qr/offers", status: 200, time: 211 },
      ],
    });
  };

  const bookFlight = () => {
    setBooked(true);
    addCall({
      id: `flight-book-${Date.now()}`,
      method: "POST",
      url: "/v1/bookings/flights",
      status: 201,
      time: 328,
    });
  };

  return (
    <div className="flights-app travel-app">
      <div className="travel-heading">
        <div className="app-icon flights"><Icon name="plane" size={23} /></div>
        <div><h1>{t.flightSearch}</h1><p>{t.flightSearchSubtitle}</p></div>
      </div>
      <form className="travel-search flight-search" onSubmit={search}>
        <label><span>{t.from}</span><input defaultValue="Bakı (GYD)" /></label>
        <label><span>{t.to}</span><input defaultValue="İstanbul (IST)" /></label>
        <label><span>{t.departureDate}</span><input defaultValue="2025-08-24" type="date" /></label>
        <label><span>{t.adults}</span><select defaultValue="1"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
        <button type="submit"><Icon name="search" size={17} />{t.searchFlights}</button>
      </form>

      <div className="results-toolbar">
        <div><h2>{t.flightResults}</h2><span>{t.flightsFound}</span></div>
        <div className="travel-controls">
          <label><span>{t.filters}</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">{t.allFlights}</option><option value="direct">{t.directOnly}</option><option value="stop">{t.oneStop}</option></select></label>
          <label><span>{t.sortBy}</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recommended">{t.recommended}</option><option value="price">{t.lowestPrice}</option><option value="duration">{t.shortestDuration}</option></select></label>
        </div>
      </div>

      <div className="flight-results">
        {visibleFlights.map((flight) => (
          <article className="flight-card" key={flight.code}>
            <div className="airline-mark">{flight.airline.slice(0, 2).toUpperCase()}</div>
            <div className="airline-name"><strong>{flight.airline}</strong><code>{flight.code}</code></div>
            <div className="flight-route">
              <div><strong>{flight.depart}</strong><span>GYD</span></div>
              <div className="route-line"><span>{flight.duration}</span><i /><small>{flight.stops === 0 ? t.direct : `1 ${t.stop}`}</small></div>
              <div><strong>{flight.arrive}</strong><span>IST</span></div>
            </div>
            <div className="flight-price"><strong>{flight.price} AZN</strong><span>{t.perAdult}</span></div>
            <button onClick={() => { setSelectedFlight(flight); setBooked(false); }} type="button">{t.selectFlight}</button>
          </article>
        ))}
      </div>

      {selectedFlight && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedFlight(null)}>
          <div className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="flight-booking-title" onMouseDown={(event) => event.stopPropagation()}>
            {booked ? (
              <div className="booking-success">
                <span><Icon name="check" size={26} /></span>
                <h2>{t.bookingConfirmed}</h2>
                <code>BK-{Date.now().toString().slice(-6)}</code>
                <button onClick={() => setSelectedFlight(null)} type="button">{t.closeMenu}</button>
              </div>
            ) : (
              <>
                <div className="booking-modal-head"><div><span>{t.bookingSummary}</span><h2 id="flight-booking-title">{selectedFlight.airline}</h2></div><button aria-label={t.closeMenu} onClick={() => setSelectedFlight(null)} type="button"><Icon name="close" size={18} /></button></div>
                <div className="booking-itinerary">
                  <div><strong>{selectedFlight.depart}</strong><span>Bakı · GYD</span></div>
                  <div><Icon name="plane" size={18} /><span>{selectedFlight.duration} · {selectedFlight.stops === 0 ? t.direct : `1 ${t.stop}`}</span></div>
                  <div><strong>{selectedFlight.arrive}</strong><span>İstanbul · IST</span></div>
                </div>
                <form className="booking-form" onSubmit={(event) => { event.preventDefault(); bookFlight(); }}>
                  <h3>{t.passengerDetails}</h3>
                  <label><span>{t.fullName}</span><input defaultValue="Rauf Məmmədov" required /></label>
                  <label><span>{t.email}</span><input defaultValue="rauf@example.com" required type="email" /></label>
                  <div className="booking-total"><span>{t.total}</span><strong>{selectedFlight.price} AZN</strong></div>
                  <button type="submit">{t.confirmBooking}<Icon name="arrow" size={17} /></button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HotelsApp({
  addCall,
  t,
}: {
  addCall: (call: NetworkCall) => void;
  t: Translation;
}) {
  const [selectedHotel, setSelectedHotel] = useState<{
    name: string;
    stars: number;
    rating: string;
    score: number;
    amenities: string[];
    price: number;
  } | null>(null);
  const [bookingError, setBookingError] = useState(false);
  const hotels = [
    { name: "Baku Marina Hotel", stars: 5, rating: t.excellent, score: 9.2, amenities: [t.freeWifi, t.breakfast, t.seaView, t.spa], price: 248 },
    { name: "Old City Courtyard", stars: 4, rating: t.veryGood, score: 8.7, amenities: [t.freeWifi, t.breakfast, t.airportShuttle], price: 164 },
    { name: "Boulevard Residence", stars: 4, rating: t.good, score: 8.3, amenities: [t.freeWifi, t.parking, t.seaView], price: 132 },
  ];

  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addCall({
      id: `hotel-search-${Date.now()}`,
      method: "GET",
      url: "/bff/hotels/search?city=Baku",
      status: 200,
      time: 391,
      type: "BFF",
      internalCalls: [
        { id: "inventory", method: "GET", url: "/hotel-inventory/search", status: 200, time: 171 },
        { id: "rates", method: "GET", url: "/hotel-rates/batch", status: 200, time: 139 },
      ],
    });
  };

  const reserve = () => {
    setBookingError(true);
    addCall({
      id: `hotel-book-${Date.now()}`,
      method: "POST",
      url: "/v1/bookings/hotels",
      status: 409,
      time: 247,
    });
  };

  return (
    <div className="hotels-app travel-app">
      <div className="travel-heading">
        <div className="app-icon hotels"><Icon name="globe" size={23} /></div>
        <div><h1>{t.hotelSearch}</h1><p>{t.hotelSearchSubtitle}</p></div>
      </div>
      <form className="travel-search hotel-search" onSubmit={search}>
        <label><span>{t.city}</span><input defaultValue="Bakı, Azərbaycan" /></label>
        <label><span>{t.checkIn}</span><input defaultValue="2025-08-24" type="date" /></label>
        <label><span>{t.checkOut}</span><input defaultValue="2025-08-27" type="date" /></label>
        <label><span>{t.guests}</span><select defaultValue="2"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
        <button type="submit"><Icon name="search" size={17} />{t.searchHotels}</button>
      </form>

      <div className="results-toolbar">
        <div><h2>{t.hotelResults}</h2><span>{t.hotelsFound}</span></div>
        <div className="travel-controls">
          <label><span>{t.guestRating}</span><select><option>8+</option><option>9+</option></select></label>
          <label><span>{t.sortBy}</span><select><option>{t.recommended}</option><option>{t.lowestPrice}</option></select></label>
        </div>
      </div>

      <div className="hotel-results">
        {hotels.map((hotel) => (
          <article className="hotel-card" key={hotel.name}>
            <div className="hotel-main">
              <div className="hotel-stars" aria-label={`${hotel.stars} stars`}>
                {Array.from({ length: hotel.stars }).map((_, index) => <Icon key={index} name="star" size={12} />)}
              </div>
              <h2>{hotel.name}</h2>
              <span>Bakı · 1.2 km from city centre</span>
              <div className="amenity-list">{hotel.amenities.map((amenity) => <span key={amenity}>{amenity}</span>)}</div>
            </div>
            <div className="hotel-rating"><div><strong>{hotel.rating}</strong><span>326 reviews</span></div><b>{hotel.score}</b></div>
            <div className="hotel-price"><strong>{hotel.price} AZN</strong><span>{t.perNight}</span><small>{t.taxesIncluded}</small><button onClick={() => { setSelectedHotel(hotel); setBookingError(false); }} type="button">{t.reserveRoom}</button></div>
          </article>
        ))}
      </div>

      {selectedHotel && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedHotel(null)}>
          <div className="booking-modal hotel-booking-modal" role="dialog" aria-modal="true" aria-labelledby="hotel-booking-title" onMouseDown={(event) => event.stopPropagation()}>
            {bookingError ? (
              <div className="booking-error-state">
                <span className="conflict-status">409</span>
                <h2>{t.roomUnavailable}</h2>
                <p>{t.roomUnavailableText}</p>
                <dl>
                  <div><dt>{t.errorCode}</dt><dd>ROOM_NOT_AVAILABLE</dd></div>
                  <div><dt>{t.traceId}</dt><dd>trc_hotel_409_x82</dd></div>
                </dl>
                <button onClick={() => { setSelectedHotel(null); setBookingError(false); }} type="button">{t.refreshResults}</button>
              </div>
            ) : (
              <>
                <div className="booking-modal-head"><div><span>{t.roomDetails}</span><h2 id="hotel-booking-title">{selectedHotel.name}</h2></div><button aria-label={t.closeMenu} onClick={() => setSelectedHotel(null)} type="button"><Icon name="close" size={18} /></button></div>
                <div className="hotel-booking-summary">
                  <div><span>{t.checkIn}</span><strong>24 Aug 2025</strong></div>
                  <div><span>{t.checkOut}</span><strong>27 Aug 2025</strong></div>
                  <div><span>{t.guests}</span><strong>2</strong></div>
                </div>
                <div className="selected-room"><div><strong>{t.standardRoom}</strong><span>{t.breakfast} · {t.freeWifi}</span></div><b>{selectedHotel.price * 3} AZN</b></div>
                <button className="hotel-confirm-button" onClick={reserve} type="button">{t.confirmBooking}<Icon name="arrow" size={17} /></button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BooksApp({
  addCall,
  t,
}: {
  addCall: (call: NetworkCall) => void;
  t: Translation;
}) {
  const [genre, setGenre] = useState("all");
  const [reviewBook, setReviewBook] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const books = [
    { title: "The Midnight Library", author: "Matt Haig", genre: "fiction", pages: 304, rating: 4.6, color: "navy" },
    { title: "Designing Data-Intensive Applications", author: "Martin Kleppmann", genre: "technology", pages: 616, rating: 4.9, color: "blue" },
    { title: "The Lean Startup", author: "Eric Ries", genre: "business", pages: 336, rating: 4.5, color: "yellow" },
    { title: "A Brief History of Time", author: "Stephen Hawking", genre: "science", pages: 256, rating: 4.8, color: "green" },
  ];
  const genres = [
    ["all", t.allGenres],
    ["fiction", t.fiction],
    ["technology", t.technology],
    ["business", t.businessGenre],
    ["science", t.science],
  ];

  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addCall({ id: `books-${Date.now()}`, method: "GET", url: `/v1/books?genre=${genre}`, status: 200, time: 73 });
  };

  const publishReview = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setReviewed(true);
    addCall({ id: `review-${Date.now()}`, method: "POST", url: "/v1/books/book_01/reviews", status: 201, time: 126 });
    window.setTimeout(() => {
      setReviewBook(null);
      setReviewed(false);
    }, 1600);
  };

  return (
    <div className="books-app">
      <div className="library-head">
        <div><span className="section-kicker"><Icon name="book" size={16} />CATALOG API</span><h1>{t.books}</h1><p>{t.booksSubtitle}</p></div>
        <form onSubmit={search}><Icon name="search" size={17} /><input aria-label={t.searchBooks} placeholder={t.searchBooks} /><button type="submit">{t.searchBooks}</button></form>
      </div>
      <div className="genre-chips" role="group" aria-label={t.allGenres}>
        {genres.map(([id, label]) => <button className={genre === id ? "active" : ""} key={id} onClick={() => setGenre(id)} type="button">{label}</button>)}
      </div>
      <div className="book-grid">
        {books.filter((book) => genre === "all" || book.genre === genre).map((book) => (
          <article className="book-card" key={book.title}>
            <div className={`book-cover ${book.color}`}><span>API LAB<br />LIBRARY</span><strong>{book.title}</strong><small>{book.author}</small></div>
            <div className="book-info">
              <span className="book-genre">{genres.find(([id]) => id === book.genre)?.[1]}</span>
              <h2>{book.title}</h2>
              <p>{t.byAuthor} {book.author}</p>
              <div className="book-meta"><span><Icon name="star" size={12} />{book.rating}</span><span>{book.pages} {t.pages}</span></div>
              <button onClick={() => setReviewBook(book.title)} type="button"><Icon name="edit" size={15} />{t.writeReview}</button>
            </div>
          </article>
        ))}
      </div>
      {reviewBook && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setReviewBook(null)}>
          <form className="review-modal" onSubmit={publishReview} onMouseDown={(event) => event.stopPropagation()}>
            <div className="booking-modal-head"><div><span>{t.reviewTitle}</span><h2>{reviewBook}</h2></div><button aria-label={t.closeMenu} onClick={() => setReviewBook(null)} type="button"><Icon name="close" size={18} /></button></div>
            <div className="review-form-content">
              <label><span>{t.yourRating}</span><select defaultValue="5"><option value="5">5 / 5</option><option value="4">4 / 5</option><option value="3">3 / 5</option></select></label>
              <label><span>{t.yourReview}</span><textarea placeholder={t.reviewPlaceholder} required /></label>
              <button className={reviewed ? "success" : ""} type="submit"><Icon name={reviewed ? "check" : "edit"} size={16} />{reviewed ? t.reviewPublished : t.publishReview}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function MusicApp({
  addCall,
  t,
}: {
  addCall: (call: NetworkCall) => void;
  t: Translation;
}) {
  const tracks = [
    { id: "trk_01", title: "Midnight Drive", artist: "Nara", album: "City Lights", duration: "3:42" },
    { id: "trk_02", title: "Blue Horizon", artist: "Caspian", album: "Coastline", duration: "4:08" },
    { id: "trk_03", title: "Quiet Signals", artist: "Leyla R.", album: "Static Bloom", duration: "3:18" },
    { id: "trk_04", title: "After Rain", artist: "Atlas", album: "Northern Lines", duration: "2:57" },
  ];
  const [playing, setPlaying] = useState<string | null>(null);
  const [progress, setProgress] = useState(18);
  const [showVideo, setShowVideo] = useState(false);
  const activeTrack = tracks.find((track) => track.id === playing) ?? tracks[0];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setProgress((value) => (value >= 100 ? 0 : value + 1)), 1000);
    return () => window.clearInterval(timer);
  }, [playing]);

  const toggleTrack = (trackId: string) => {
    const next = playing === trackId ? null : trackId;
    setPlaying(next);
    if (next) {
      setProgress(0);
      addCall({ id: `stream-${Date.now()}`, method: "GET", url: `/v1/tracks/${trackId}/stream`, status: 206, time: 92 });
    }
  };

  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addCall({ id: `music-search-${Date.now()}`, method: "GET", url: "/v1/music/search?q=midnight", status: 200, time: 64 });
  };

  return (
    <div className="music-app">
      <div className="music-head">
        <div><span className="section-kicker"><Icon name="music" size={16} />STREAMING API</span><h1>{t.music}</h1></div>
        <form onSubmit={search}><Icon name="search" size={17} /><input aria-label={t.searchMusic} placeholder={t.searchMusic} /><button type="submit">{t.searchMusic}</button></form>
      </div>
      <section className="playlist-section">
        <div className="app-section-title"><h2>{t.playlists}</h2><span>3</span></div>
        <div className="playlist-grid">
          {[["Focus Flow", "24"], ["API After Hours", "18"], ["Morning Build", "31"]].map(([name, count], index) => (
            <article className={`playlist-card playlist-${index + 1}`} key={name}><div><Icon name="music" size={22} /></div><strong>{name}</strong><span>{count} {t.songs}</span></article>
          ))}
        </div>
      </section>
      <section className="track-section">
        <div className="app-section-title"><h2>{t.tracks}</h2><span>{tracks.length}</span></div>
        <div className="track-list">
          <div className="track-head"><span>#</span><span>{t.song}</span><span>{t.album}</span><span>{t.length}</span></div>
          {tracks.map((track, index) => (
            <div className={playing === track.id ? "track-row active" : "track-row"} key={track.id}>
              <button aria-label={playing === track.id ? t.pauseTrack : t.playTrack} onClick={() => toggleTrack(track.id)} type="button"><Icon name={playing === track.id ? "pause" : "play"} size={15} /></button>
              <div><strong>{track.title}</strong><span>{track.artist}</span></div>
              <span>{track.album}</span><code>{track.duration}</code>
            </div>
          ))}
        </div>
      </section>
      <div className="music-player">
        <button className="player-play" aria-label={playing ? t.pauseTrack : t.playTrack} onClick={() => toggleTrack(activeTrack.id)} type="button"><Icon name={playing ? "pause" : "play"} size={18} /></button>
        <div className="player-track"><strong>{activeTrack.title}</strong><span>{activeTrack.artist}</span></div>
        <div className="player-progress"><span>0:{Math.floor(progress * 2.22).toString().padStart(2, "0")}</span><input aria-label={t.nowPlaying} max="100" onChange={(event) => setProgress(Number(event.target.value))} type="range" value={progress} /><span>{activeTrack.duration}</span></div>
        <button className="video-toggle" aria-label={showVideo ? t.hideVideo : t.showVideo} onClick={() => setShowVideo(!showVideo)} type="button"><Icon name="play" size={14} /></button>
        <div className={showVideo ? "youtube-mini visible" : "youtube-mini"} aria-hidden={!showVideo}>
          <iframe allow="autoplay; encrypted-media" src={showVideo ? "https://www.youtube-nocookie.com/embed/jfKfPfyJRdk?controls=0" : "about:blank"} title="YouTube music preview" />
        </div>
      </div>
    </div>
  );
}

type Customer = { id: string; name: string; email: string; company: string; created: string };

function CustomersApp({
  addCall,
  t,
}: {
  addCall: (call: NetworkCall) => void;
  t: Translation;
}) {
  const [customers, setCustomers] = useState<Customer[]>([
    { id: "cus_001", name: "Aylin Əliyeva", email: "aylin@example.com", company: "Northstar LLC", created: "12 Jun 2025" },
    { id: "cus_002", name: "Murad Həsənli", email: "murad@example.com", company: "Caspian Studio", created: "08 Jun 2025" },
    { id: "cus_003", name: "Nigar Abbasova", email: "nigar@example.com", company: "Solo", created: "30 May 2025" },
  ]);
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [updateMethod, setUpdateMethod] = useState<"PUT" | "PATCH">("PATCH");

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const isNew = editing === "new";
    const customer: Customer = {
      id: isNew ? `cus_${String(customers.length + 1).padStart(3, "0")}` : (editing as Customer).id,
      name: String(fields.get("name")),
      email: String(fields.get("email")),
      company: String(fields.get("company")),
      created: isNew ? t.today : (editing as Customer).created,
    };
    setCustomers((items) => isNew ? [customer, ...items] : items.map((item) => item.id === customer.id ? customer : item));
    addCall({ id: `customer-save-${Date.now()}`, method: isNew ? "POST" : updateMethod, url: isNew ? "/v1/customers" : `/v1/customers/${customer.id}`, status: isNew ? 201 : 200, time: 114 });
    setEditing(null);
  };

  const remove = () => {
    if (!deleting) return;
    setCustomers((items) => items.filter((item) => item.id !== deleting.id));
    addCall({ id: `customer-delete-${Date.now()}`, method: "DELETE", url: `/v1/customers/${deleting.id}`, status: 204, time: 86 });
    setDeleting(null);
  };

  return (
    <div className="customers-app">
      <div className="customers-head"><div><span className="section-kicker"><Icon name="users" size={16} />CUSTOMER API</span><h1>{t.customerDirectory}</h1><p>{t.customerSubtitle}</p></div><button onClick={() => setEditing("new")} type="button"><Icon name="plus" size={17} />{t.createCustomer}</button></div>
      <div className="customer-table-card table-scroll">
        <table><thead><tr><th>{t.fullName}</th><th>{t.email}</th><th>{t.company}</th><th>{t.created}</th><th>{t.actions}</th></tr></thead>
          <tbody>{customers.map((customer) => <tr key={customer.id}><td><span className="table-avatar">{customer.name.split(" ").map((part) => part[0]).join("")}</span><div><strong>{customer.name}</strong><code>{customer.id}</code></div></td><td>{customer.email}</td><td>{customer.company}</td><td>{customer.created}</td><td><div className="customer-actions"><button aria-label={t.editCustomer} onClick={() => setEditing(customer)} type="button"><Icon name="edit" size={15} /></button><button aria-label={t.deleteCustomer} onClick={() => setDeleting(customer)} type="button"><Icon name="trash" size={15} /></button></div></td></tr>)}</tbody>
        </table>
      </div>
      {editing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditing(null)}>
          <form className="customer-modal" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}>
            <div className="booking-modal-head"><div><span>CUSTOMER API</span><h2>{editing === "new" ? t.createCustomer : t.editCustomer}</h2></div><button aria-label={t.closeMenu} onClick={() => setEditing(null)} type="button"><Icon name="close" size={18} /></button></div>
            <div className="customer-form">
              {editing !== "new" && <div className="method-choice"><span>{t.updateMethod}</span><div>{(["PUT", "PATCH"] as const).map((method) => <button className={updateMethod === method ? "active" : ""} key={method} onClick={() => setUpdateMethod(method)} type="button">{method}</button>)}</div><small>{updateMethod === "PUT" ? t.putDescription : t.patchDescription}</small></div>}
              <label><span>{t.fullName}</span><input defaultValue={editing === "new" ? "" : editing.name} name="name" required /></label>
              <label><span>{t.email}</span><input defaultValue={editing === "new" ? "" : editing.email} name="email" required type="email" /></label>
              <label><span>{t.company}</span><input defaultValue={editing === "new" ? "" : editing.company} name="company" required /></label>
              <button type="submit">{t.saveCustomer}<Icon name="arrow" size={16} /></button>
            </div>
          </form>
        </div>
      )}
      {deleting && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setDeleting(null)}>
          <div className="delete-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="modal-danger-icon"><Icon name="trash" size={22} /></div><h2>{t.deleteCustomerTitle}</h2><p>{t.deleteCustomerText}</p><strong>{deleting.name}</strong><div className="modal-actions"><button onClick={() => setDeleting(null)} type="button">{t.cancel}</button><button onClick={remove} type="button">{t.confirmDelete}</button></div></div>
        </div>
      )}
    </div>
  );
}

function GoogleAuthApp({
  addCall,
  t,
}: {
  addCall: (call: NetworkCall) => void;
  t: Translation;
}) {
  const [step, setStep] = useState(0);
  const steps = [t.authorizationRequest, t.userConsent, t.authorizationCode, t.tokenExchange];

  const next = () => {
    const nextStep = Math.min(step + 1, 4);
    const calls = [
      { method: "GET", url: "/oauth/authorize?client_id=api_lab", status: 302, time: 36 },
      { method: "POST", url: "/oauth/consent", status: 302, time: 74 },
      { method: "GET", url: "/auth/callback?code=mock_code", status: 200, time: 58 },
      { method: "POST", url: "/oauth/token", status: 200, time: 129 },
    ];
    const call = calls[Math.min(step, 3)];
    addCall({ id: `oauth-${Date.now()}`, ...call });
    setStep(nextStep);
  };

  return (
    <div className="google-auth-app">
      <div className="oauth-intro"><span className="google-mark">G</span><h1>{t.googleConsent}</h1><p>{t.googleConsentSubtitle}</p></div>
      <div className="oauth-layout">
        <aside className="oauth-steps"><span>{t.oauthFlow}</span>{steps.map((label, index) => <div className={step > index ? "complete" : step === index ? "active" : ""} key={label}><i>{step > index ? <Icon name="check" size={13} /> : index + 1}</i><span>{label}</span></div>)}</aside>
        <section className="consent-card">
          {step < 4 ? (
            <>
              <div className="consent-brand"><span className="google-mark">G</span><strong>{t.googleSignIn}</strong><small>{t.currentStep} {Math.min(step + 1, 4)} / 4</small></div>
              {step === 1 ? (
                <div className="consent-body"><h2>{t.consentTitle}</h2><div className="consent-account"><span className="avatar">RM</span><div><strong>Rauf Məmmədov</strong><span>rauf@example.com</span></div></div><p>{t.consentPermissions}</p><ul><li><Icon name="users" size={17} />{t.viewProfile}</li><li><Icon name="globe" size={17} />{t.viewEmail}</li></ul><div className="consent-actions"><button onClick={() => setStep(0)} type="button">{t.deny}</button><button onClick={next} type="button">{t.allow}</button></div></div>
              ) : (
                <div className="oauth-step-body"><div className="oauth-code-icon"><Icon name={step === 0 ? "arrow" : step === 2 ? "code" : "lock"} size={25} /></div><h2>{steps[Math.min(step, 3)]}</h2><code>{step === 0 ? "response_type=code&scope=openid email profile" : step === 2 ? "code=4/mock_authorization_code" : "grant_type=authorization_code"}</code><button onClick={next} type="button">{t.continueFlow}<Icon name="arrow" size={16} /></button></div>
              )}
            </>
          ) : (
            <div className="oauth-complete"><span><Icon name="check" size={26} /></span><h2>{t.oauthComplete}</h2><p>{t.oauthCompleteText}</p><code>access_token: ya29.mock••••••••</code><button onClick={() => setStep(0)} type="button">{t.restartFlow}</button></div>
          )}
        </section>
      </div>
    </div>
  );
}

function AppsPage({
  onOpenExplorer,
  t,
}: {
  onOpenExplorer: () => void;
  t: Translation;
}) {
  const [selectedApp, setSelectedApp] = useState<AppId | null>(null);
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

  const addCall = async (call: NetworkCall) => {
    const result = await apiClient.runAppCall(call);
    setCalls((items) => [result, ...items].slice(0, 12));
  };

  const openApp = (id: AppId) => {
    setSelectedApp(id);
    setCalls([]);
    setNetworkOpen(true);
    const initialCall: NetworkCall =
      id === "bank"
        ? {
            id: `overview-${Date.now()}`,
            method: "GET",
            url: "/bff/bank/overview",
            status: 200,
            time: 212,
            type: "BFF",
            internalCalls: [
              { id: "accounts", method: "GET", url: "/accounts", status: 200, time: 42 },
              { id: "cards", method: "GET", url: "/cards", status: 200, time: 51 },
              { id: "activity", method: "GET", url: "/transactions?limit=5", status: 200, time: 68 },
            ],
          }
        : {
            id: `app-${Date.now()}`,
            method: "GET",
            url:
              id === "currency"
                ? "/v1/rates?base=AZN&symbols=USD"
                : id === "flights"
                  ? "/v1/flights/popular"
                  : id === "hotels"
                    ? "/v1/hotels/featured?city=Baku"
                    : id === "books"
                      ? "/v1/books?featured=true"
                      : id === "music"
                        ? "/v1/playlists/featured"
                        : id === "customers"
                          ? "/v1/customers"
                          : id === "google"
                            ? "/oauth/.well-known/openid-configuration"
                            : `/v1/apps/${id}`,
            status: 200,
            time: id === "currency" ? 46 : id === "flights" ? 72 : id === "hotels" ? 81 : 54,
          };
    void addCall(initialCall);
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
            <BankApp addCall={addCall} t={t} />
          ) : selectedApp === "currency" ? (
            <CurrencyApp addCall={addCall} t={t} />
          ) : selectedApp === "flights" ? (
            <FlightsApp addCall={addCall} t={t} />
          ) : selectedApp === "hotels" ? (
            <HotelsApp addCall={addCall} t={t} />
          ) : selectedApp === "books" ? (
            <BooksApp addCall={addCall} t={t} />
          ) : selectedApp === "music" ? (
            <MusicApp addCall={addCall} t={t} />
          ) : selectedApp === "customers" ? (
            <CustomersApp addCall={addCall} t={t} />
          ) : selectedApp === "google" ? (
            <GoogleAuthApp addCall={addCall} t={t} />
          ) : (
            <div className="coming-soon-app">
              <span className={`app-icon ${activeApp.id}`}><Icon name={activeApp.icon} size={28} /></span>
              <h1>{activeApp.title}</h1>
              <p>{activeApp.description}</p>
              <span>{t.comingSoon}</span>
            </div>
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
  const [selectedAccount, setSelectedAccount] = useState<GoogleAccount | null>(
    null,
  );
  const [error, setError] = useState<"denied" | "invalid" | null>(null);
  const [showCalls, setShowCalls] = useState(false);
  const [successName, setSuccessName] = useState("");
  const accounts = authClient.getGoogleAccounts();
  const steps = [
    t.redirectAuthServer,
    t.chooseAccount,
    t.consent,
    t.tokenExchangeStep,
  ];

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

  useEffect(() => {
    let cancelled = false;
    authClient.authorizeGoogle().then((result) => {
      if (cancelled) return;
      setOauthState(result.state);
      window.setTimeout(() => {
        if (!cancelled) setStep(1);
      }, 650);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const allow = async () => {
    if (!selectedAccount) return;
    setStep(3);
    try {
      const session = await authClient.exchangeGoogleCode(
        selectedAccount,
        oauthState,
      );
      setSuccessName(session.user.name);
      window.setTimeout(() => onSignedIn(session), 900);
    } catch {
      setError("invalid");
    }
  };

  const reset = () => {
    setError(null);
    setSelectedAccount(null);
    setSuccessName("");
    setStep(1);
  };

  const calls = [
    { method: "GET", url: "/oauth/authorize", status: 302, visible: true },
    {
      method: "GET",
      url: "/auth/callback?code=mock_code&state=state_•••",
      status: 302,
      visible: step >= 2,
    },
    { method: "POST", url: "/oauth/token", status: 200, visible: step >= 3 },
    {
      method: "GET",
      url: "/oauth/userinfo",
      status: 200,
      visible: Boolean(successName),
    },
  ];

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
                  : t.invalidCodeText}
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
              <p className="mock-google-notice">{t.mockGoogleNotice}</p>
              <div className="google-consent-actions">
                <button onClick={() => setError("denied")} type="button">
                  {t.cancel}
                </button>
                <button onClick={allow} type="button">
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
              {calls
                .filter((call) => call.visible)
                .map((call) => (
                  <div className="oauth-http-call" key={call.url}>
                    <span
                      className={`mini-method method-${call.method.toLowerCase()}`}
                    >
                      {call.method}
                    </span>
                    <code>{call.url}</code>
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
              "trc_unknown",
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
                    : t.wrongCredentials}
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

function AuthLabPage({ t }: { t: Translation }) {
  const demoJwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzdHVkZW50Iiwicm9sZSI6InN0dWRlbnQiLCJpYXQiOjE3NTAwMDAwMDAsImV4cCI6MTc1MDAwMzYwMH0.mock_signature_8fa2c1";
  const [loginState, setLoginState] = useState<"idle" | "loading" | "success">("idle");
  const [jwt, setJwt] = useState(demoJwt);
  const [decoded, setDecoded] = useState(true);
  const [refreshed, setRefreshed] = useState(false);
  const [oauthStep, setOauthStep] = useState(-1);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (!animating) return;
    if (oauthStep >= 3) {
      setAnimating(false);
      return;
    }
    const timer = window.setTimeout(() => setOauthStep((step) => step + 1), 1100);
    return () => window.clearTimeout(timer);
  }, [animating, oauthStep]);

  const login = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginState("loading");
    window.setTimeout(() => {
      setLoginState("success");
      setJwt(demoJwt);
      setDecoded(true);
    }, 700);
  };

  const refreshToken = () => {
    setRefreshed(true);
    setJwt(`${demoJwt.slice(0, demoJwt.lastIndexOf("."))}.refreshed_signature_91bf`);
    window.setTimeout(() => setRefreshed(false), 1800);
  };

  const startOauth = () => {
    setOauthStep(0);
    setAnimating(true);
  };

  const oauthSteps = [
    { from: t.browser, to: t.authorizationServer, label: t.redirectToLogin, code: "GET /oauth/authorize" },
    { from: t.authorizationServer, to: t.browser, label: t.returnCode, code: "302 /callback?code=..." },
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
          <div className="lab-card-heading"><span className="lab-card-icon"><Icon name="lock" size={20} /></span><div><h2>{t.login}</h2><p>{t.loginDescription}</p></div></div>
          <form onSubmit={login}>
            <label><span>{t.username}</span><input defaultValue="student" /></label>
            <label><span>{t.password}</span><input defaultValue="student123" type="password" /></label>
            <button className={loginState === "success" ? "success" : ""} type="submit">
              {loginState === "loading" ? <span className="button-spinner" /> : <Icon name={loginState === "success" ? "check" : "arrow"} size={17} />}
              {loginState === "loading" ? t.signingIn : loginState === "success" ? t.loginSuccess : t.signIn}
            </button>
          </form>
          {loginState === "success" && <div className="token-ready"><Icon name="check" size={15} /><span>{t.accessTokenReady}</span><code>200 OK</code></div>}
        </section>

        <section className="lab-card jwt-card">
          <div className="lab-card-heading"><span className="lab-card-icon blue"><Icon name="code" size={20} /></span><div><h2>{t.jwtDecoder}</h2><p>{t.jwtDescription}</p></div></div>
          <label className="jwt-input"><span>{t.pasteJwt}</span><textarea onChange={(event) => setJwt(event.target.value)} spellCheck="false" value={jwt} /></label>
          <div className="jwt-actions">
            <button onClick={() => setDecoded(true)} type="button">{t.decode}</button>
            <button className={refreshed ? "success" : ""} onClick={refreshToken} type="button"><Icon name={refreshed ? "check" : "repeat"} size={15} />{refreshed ? t.tokenRefreshed : t.refresh}</button>
          </div>
        </section>
      </div>

      {decoded && (
        <section className="jwt-parts" aria-label={t.jwtDecoder}>
          <article className="jwt-part header-part"><div><span>1</span><h3>{t.jwtHeader}</h3></div><pre>{'{\n  "alg": "HS256",\n  "typ": "JWT"\n}'}</pre></article>
          <article className="jwt-part payload-part"><div><span>2</span><h3>{t.jwtPayload}</h3></div><pre>{'{\n  "sub": "student",\n  "role": "student",\n  "iat": 1750000000,\n  "exp": 1750003600\n}'}</pre><div className="jwt-time"><span>{t.issuedAt}<b>10:00</b></span><span>{t.expiresAt}<b>11:00</b></span></div></article>
          <article className="jwt-part signature-part"><div><span>3</span><h3>{t.jwtSignature}</h3></div><pre>HMACSHA256(<br />&nbsp; base64UrlEncode(header) + "." +<br />&nbsp; base64UrlEncode(payload),<br />&nbsp; secret<br />)</pre></article>
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

type SqlResult = { columns: string[]; rows: string[][] };

function SqlPlaygroundPage({ t }: { t: Translation }) {
  const [query, setQuery] = useState("SELECT id, name, email, role\nFROM users\nWHERE status = 'active'\nORDER BY created_at DESC;");
  const [result, setResult] = useState<SqlResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(false);
  const [selectedTable, setSelectedTable] = useState("users");
  const schemas = [
    { name: "users", columns: ["id · uuid", "name · varchar", "email · varchar", "role · varchar", "status · boolean"] },
    { name: "cards", columns: ["id · uuid", "user_id · uuid", "brand · varchar", "status · varchar"] },
    { name: "bookings", columns: ["id · uuid", "user_id · uuid", "type · varchar", "total · decimal"] },
    { name: "transactions", columns: ["id · uuid", "account_id · uuid", "amount · decimal", "created_at · timestamp"] },
  ];

  const execute = (nextQuery = query) => {
    setQuery(nextQuery);
    if (!nextQuery.trim().toLowerCase().startsWith("select")) {
      setError(true);
      setResult(null);
      return;
    }
    setError(false);
    setRunning(true);
    window.setTimeout(() => {
      if (nextQuery.includes("cards")) {
        setResult({ columns: ["id", "brand", "last_four", "status"], rows: [["card_01", "VISA", "4821", "ACTIVE"], ["card_02", "MASTERCARD", "1093", "ACTIVE"]] });
      } else if (nextQuery.includes("bookings")) {
        setResult({ columns: ["id", "type", "destination", "total"], rows: [["bk_1042", "flight", "Istanbul", "428.00"], ["bk_1038", "hotel", "Baku", "492.00"]] });
      } else {
        setResult({ columns: ["id", "name", "email", "role"], rows: [["usr_01", "Aylin Əliyeva", "aylin@example.com", "student"], ["usr_02", "Rauf Məmmədov", "rauf@example.com", "instructor"], ["usr_03", "Murad Həsənli", "murad@example.com", "student"]] });
      }
      setRunning(false);
    }, 650);
  };

  const quickQueries = [
    [t.allUsers, "SELECT id, name, email, role\nFROM users\nORDER BY created_at DESC;"],
    [t.activeCards, "SELECT id, brand, last_four, status\nFROM cards\nWHERE status = 'ACTIVE';"],
    [t.recentBookings, "SELECT id, type, destination, total\nFROM bookings\nORDER BY created_at DESC\nLIMIT 10;"],
  ];

  return (
    <main className="sql-page" id="main-content">
      <div className="sql-titlebar"><div><span className="section-kicker"><Icon name="code" size={16} />{t.dataLab}</span><h1>{t.sqlPlayground}</h1><p>{t.sqlSubtitle}</p></div><div className="select-only-badge"><Icon name="lock" size={15} /><span><strong>{t.selectOnly}</strong><small>{t.selectOnlyNotice}</small></span></div></div>
      <div className="quick-query-row"><span>{t.quickQueries}</span>{quickQueries.map(([label, sql]) => <button key={label} onClick={() => execute(sql)} type="button"><Icon name="play" size={12} />{label}</button>)}</div>
      <div className="sql-workspace">
        <aside className="schema-panel">
          <div className="sql-panel-head"><span>{t.schemaTree}</span><code>public</code></div>
          <div className="schema-title"><Icon name="chevron" size={13} /><span>{t.tables}</span><b>{schemas.length}</b></div>
          {schemas.map((table) => <div className={selectedTable === table.name ? "schema-table active" : "schema-table"} key={table.name}><button onClick={() => setSelectedTable(table.name)} type="button"><Icon name="chevron" size={13} /><span>{table.name}</span></button>{selectedTable === table.name && <div>{table.columns.map((column) => <code key={column}>{column}</code>)}</div>}</div>)}
        </aside>
        <section className="sql-editor-panel">
          <div className="sql-panel-head"><span>{t.sqlEditor}</span><div><button onClick={() => setQuery(query.replace(/\s+/g, " ").replace(/ SELECT /gi, "\nSELECT ").trim())} type="button">{t.formatQuery}</button><button disabled={running} onClick={() => execute()} type="button">{running ? <span className="button-spinner" /> : <Icon name="play" size={14} />}{running ? t.runningQuery : t.runQuery}</button></div></div>
          <div className="sql-code-editor"><div className="line-numbers">1<br />2<br />3<br />4<br />5<br />6</div><textarea aria-label={t.sqlEditor} onChange={(event) => setQuery(event.target.value)} spellCheck="false" value={query} /></div>
          {error && <div className="sql-error"><span>!</span><strong>{t.sqlError}</strong><code>SQL_WRITE_OPERATION_NOT_ALLOWED</code></div>}
          <div className="sql-results">
            <div className="results-head"><span>{t.queryResults}</span>{result && <small>{result.rows.length} {t.rowsReturned} · {t.queryTime}: 24 ms</small>}</div>
            {running ? <div className="sql-result-skeleton"><i /><i /><i /></div> : result ? <div className="table-scroll"><table><thead><tr>{result.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><code>{cell}</code></td>)}</tr>)}</tbody></table></div> : <div className="sql-empty"><span><Icon name="code" size={24} /></span><h3>{t.sqlEmptyTitle}</h3><p>{t.sqlEmptyText}</p></div>}
          </div>
        </section>
      </div>
    </main>
  );
}

function MaterialsPage({
  onNavigate,
  t,
}: {
  onNavigate: (page: Page) => void;
  t: Translation;
}) {
  const [completed, setCompleted] = useState<number[]>([0]);
  const tasks = [
    { label: t.taskSendRequest, action: "explorer" as Page },
    { label: t.taskInspectHeaders, action: "explorer" as Page },
    { label: t.taskRefreshToken, action: "auth" as Page },
    { label: t.taskSqlUsers, action: "sql" as Page },
    { label: t.taskIdempotency, action: "explorer" as Page },
  ];
  const lessons = [
    { number: "01", title: t.lessonIntro, meta: "18 min", method: "GET", icon: "compass" as const },
    { number: "02", title: t.lessonHttp, meta: "26 min", method: "REST", icon: "network" as const },
    { number: "03", title: t.lessonAuth, meta: "32 min", method: "JWT", icon: "lock" as const },
    { number: "04", title: t.lessonData, meta: "24 min", method: "SQL", icon: "code" as const },
  ];
  const downloads = [
    { title: t.presentation, type: t.pptxFile, ext: "PPTX", size: "8.4 MB", href: "/materials/api-lab-course.pptx" },
    { title: t.workbook, type: t.pdfFile, ext: "PDF", size: "3.1 MB", href: "/materials/api-lab-workbook.pdf" },
    { title: t.postmanCollection, type: t.jsonFile, ext: "JSON", size: "42 KB", href: "/materials/api-lab.postman_collection.json" },
  ];

  const toggleTask = (index: number) => {
    setCompleted((items) => items.includes(index) ? items.filter((item) => item !== index) : [...items, index]);
  };

  return (
    <main className="materials-page" id="main-content">
      <div className="materials-hero">
        <div><span className="section-kicker"><Icon name="book" size={16} />{t.learningHub}</span><h1>{t.materialsTitle}</h1><p>{t.materialsSubtitle}</p></div>
        <div className="course-progress"><div><span>{t.courseProgress}</span><strong>{Math.round((completed.length / tasks.length) * 100)}%</strong></div><div className={`progress-track progress-${completed.length}`}><i /></div><small>{completed.length} / {tasks.length} {t.completedTasks}</small></div>
      </div>
      <section className="materials-section"><div className="materials-section-head"><h2>{t.lessonMaterials}</h2><span>{t.fourLessons}</span></div><div className="material-lesson-grid">{lessons.map((lesson, index) => <article key={lesson.number}><div className={`material-lesson-icon icon-${index + 1}`}><Icon name={lesson.icon} size={21} /></div><span>{t.lesson} {lesson.number}</span><h3>{lesson.title}</h3><div><small>{lesson.meta}</small><b>{lesson.method}</b></div></article>)}</div></section>
      <div className="materials-two-column">
        <section className="materials-section task-section"><div className="materials-section-head"><h2>{t.practicalTasks}</h2><span>{completed.length}/{tasks.length}</span></div><div className="task-list">{tasks.map((task, index) => <article className={completed.includes(index) ? "complete" : ""} key={task.label}><button aria-label={t.markComplete} onClick={() => toggleTask(index)} type="button">{completed.includes(index) && <Icon name="check" size={15} />}</button><span>{task.label}</span><button onClick={() => onNavigate(task.action)} type="button">{task.action === "sql" ? t.checkWithSql : task.action === "auth" ? t.authLab : t.openInExplorerTask}<Icon name="arrow" size={14} /></button></article>)}</div></section>
        <section className="materials-section download-section"><div className="materials-section-head"><div><h2>{t.downloads}</h2><p>{t.downloadsSubtitle}</p></div></div><div className="download-list">{downloads.map((file) => <a download href={file.href} key={file.ext}><span className={`file-icon file-${file.ext.toLowerCase()}`}>{file.ext}</span><div><strong>{file.title}</strong><small>{file.type} · {file.size}</small></div><span><Icon name="arrow" size={16} />{t.download}</span></a>)}</div></section>
      </div>
    </main>
  );
}

function App() {
  const [language, setLanguage] = useState<Language>("az");
  const [currentPage, setCurrentPage] = useState<Page>(() =>
    window.location.pathname === "/signin" ? "signin" : "home",
  );
  const [intendedPage, setIntendedPage] = useState<Page>("home");
  const [session, setSession] = useState<AuthSession | null>(() =>
    authClient.getStoredSession(),
  );
  const [sessionExpired, setSessionExpired] = useState(false);
  const [refreshingSession, setRefreshingSession] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("api-lab-theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [data, setData] = useState<HomeData | null>(null);
  const t = translations[language];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("api-lab-theme", theme);
  }, [theme]);

  useEffect(() => {
    apiClient.getHomeData().then(setData);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === "/signin" && !session) {
        setCurrentPage("signin");
      } else {
        setCurrentPage("home");
      }
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

  const protectedPages: Page[] = [
    "explorer",
    "apps",
    "auth",
    "sql",
    "materials",
  ];

  const navigateTo = (page: Page) => {
    if (protectedPages.includes(page) && !session) {
      setIntendedPage(page);
      setCurrentPage("signin");
      window.history.pushState({}, "", "/signin");
      return;
    }
    setCurrentPage(page);
    window.history.pushState({}, "", page === "signin" ? "/signin" : "/");
  };

  const completeSignIn = (nextSession: AuthSession) => {
    const destination =
      intendedPage === "signin" ? "home" : intendedPage;
    setSession(nextSession);
    setSessionExpired(false);
    setCurrentPage(destination);
    setIntendedPage("home");
    window.history.replaceState({}, "", "/");
  };

  const signOut = () => {
    authClient.signOut();
    setSession(null);
    setCurrentPage("home");
    setIntendedPage("home");
    window.history.replaceState({}, "", "/");
  };

  const refreshExpiredSession = async () => {
    setRefreshingSession(true);
    try {
      const refreshed = await authClient.refreshSession();
      setSession(refreshed);
      setSessionExpired(false);
    } finally {
      setRefreshingSession(false);
    }
  };

  const lessons = [
    { title: t.lesson1Title, description: t.lesson1Description, meta: t.lesson1Meta },
    { title: t.lesson2Title, description: t.lesson2Description, meta: t.lesson2Meta },
    { title: t.lesson3Title, description: t.lesson3Description, meta: t.lesson3Meta },
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
                  href="#explorer"
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
                  <span className="method-badge get">GET</span>
                  <code>/v1/users/rauf</code>
                  <button className="send-button" type="button" aria-label={t.sendRequest}>
                    <Icon name="play" size={16} />
                  </button>
                </div>
                <div className="response-block">
                  <div className="response-head">
                    <span>Response</span>
                    <span className="status-chip">200 OK</span>
                  </div>
                  <pre>
                    <span className="code-brace">{"{"}</span>
                    {"\n  "}<span className="code-key">"id"</span>: <span className="code-number">42</span>,
                    {"\n  "}<span className="code-key">"name"</span>: <span className="code-string">"Rauf"</span>,
                    {"\n  "}<span className="code-key">"role"</span>: <span className="code-string">"student"</span>
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
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t.username}</th>
                      <th>{t.password}</th>
                      <th>{t.role}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.users.map((user, index) => (
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
                            {index === 0
                              ? t.student
                              : index === 1
                                ? t.administrator
                                : t.instructor}
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
                <span>0 / 3</span>
                <div><i /></div>
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
                    <a href="#">
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
              <pre><span>curl</span> -X GET \{"\n  "}<span className="terminal-url">{data?.baseUrl ?? "..."}/users</span> \{"\n  "}-H <span className="terminal-string">"Accept: application/json"</span></pre>
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
        <AppsPage onOpenExplorer={() => navigateTo("explorer")} t={t} />
      ) : currentPage === "auth" ? (
        <AuthLabPage t={t} />
      ) : currentPage === "sql" ? (
        <SqlPlaygroundPage t={t} />
      ) : (
        <MaterialsPage onNavigate={navigateTo} t={t} />
      )}

      <footer>
        <div className="footer-inner">
          <a className="brand brand--footer" href="#top">
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

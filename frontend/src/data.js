// Fallback catalog — used when the API/DB is unavailable so the site always
// renders as a complete, professional storefront. When the backend responds,
// its data takes precedence. Field names mirror the SQL schema
// (title_he / title_ru / description_he / ...) so the same components work
// against either source.

export const CATEGORIES = [
  { id: 1, slug: "extreme",   name_he: "אקסטרים",         name_ru: "Экстрим",           emoji: "🪂", img: "/img/extreme.jpg", tint: "from-coral-500 to-coral-700" },
  { id: 2, slug: "flights",   name_he: "טיסות ושמיים",     name_ru: "Полёты",            emoji: "🎈", img: "https://images.unsplash.com/photo-1507608443039-bfde4fbcd142?auto=format&fit=crop&crop=entropy&w=600&h=800&q=80", tint: "from-teal-400 to-teal-600" },
  { id: 3, slug: "tours",     name_he: "סיורים בישראל",    name_ru: "Экскурсии по Израилю", emoji: "🏛️", img: "/img/tours.jpg", tint: "from-sun-500 to-teal-600" },
  { id: 4, slug: "gastro",    name_he: "קולינריה",         name_ru: "Гастрономия",       emoji: "🍷", img: "/img/gastro.jpg", tint: "from-sun-500 to-coral-600" },
  { id: 5, slug: "spa",       name_he: "ספא ויופי",        name_ru: "Спа и красота",     emoji: "🧖", img: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&crop=entropy&w=600&h=800&q=80", tint: "from-berry-500 to-coral-400" },
  { id: 6, slug: "romance",   name_he: "רומנטיקה",         name_ru: "Романтика",         emoji: "💕", img: "https://images.unsplash.com/photo-1518621736915-f3b1c41bfd00?auto=format&fit=crop&crop=entropy&w=600&h=800&q=80", tint: "from-coral-400 to-berry-500" },
  { id: 7, slug: "workshops", name_he: "סדנאות",           name_ru: "Мастер-классы",     emoji: "🎨", img: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&crop=entropy&w=600&h=800&q=80", tint: "from-teal-500 to-berry-600" }
];

// Businesses / partners — each experience is provided by one of these. Keyed by
// category slug in the fallback; the API returns the same shape as exp.business.
export const BUSINESSES = {
  extreme: { slug: "partner-extreme", name_he: "אדרנלין ישראל", name_ru: "Адреналин Израиль", description_he: "חברת אקסטרים מובילה עם מדריכים מוסמכים וציוד בטיחות מהשורה הראשונה.", description_ru: "Ведущая компания экстрим-впечатлений: сертифицированные инструкторы и снаряжение высшего класса.", location_he: "מרכז, צפון ודרום", location_ru: "Центр, север и юг", emoji: "🪂", since: 2011, rating: 4.9 },
  flights: { slug: "partner-flights", name_he: "שמיים פתוחים", name_ru: "Открытое небо", description_he: "טיסות בלון, מצנחי רחיפה וחוויות אוויר בהובלת טייסים ותיקים.", description_ru: "Полёты на шарах, параглайдинг и воздушные впечатления с опытными пилотами.", location_he: "עמק יזרעאל והכרמל", location_ru: "Изреельская долина и Кармель", emoji: "🎈", since: 2014, rating: 5.0 },
  spa: { slug: "partner-spa", name_he: "נווה שלווה", name_ru: "Оазис спокойствия", description_he: "רשת ספא בוטיק עם מטפלים מקצועיים, מרחבי מים חמים וטיפולים אישיים.", description_ru: "Сеть бутик-спа с профессиональными терапевтами, тёплыми бассейнами и индивидуальными процедурами.", location_he: "תל אביב, הרצליה, ים המלח", location_ru: "Тель-Авив, Герцлия, Мёртвое море", emoji: "🧖", since: 2009, rating: 4.8 },
  tours: { slug: "partner-tours", name_he: "שבילים", name_ru: "Тропы", description_he: "מדריכים מוסמכים לסיורי היסטוריה, ארכיאולוגיה וטבע ברחבי ישראל.", description_ru: "Сертифицированные гиды для исторических, археологических и природных экскурсий по всему Израилю.", location_he: "ירושלים, עכו, הגליל והדרום", location_ru: "Иерусалим, Акко, Галилея и юг", emoji: "🏛️", since: 2012, rating: 4.9 },
  gastro: { slug: "partner-gastro", name_he: "טעמים", name_ru: "Вкусы", description_he: "שפים פרטיים, יקבי בוטיק וחוויות קולינריות בשיתוף יצרנים מקומיים.", description_ru: "Частные шефы, бутиковые винодельни и кулинарные впечатления с местными производителями.", location_he: "הגליל, השרון ותל אביב", location_ru: "Галилея, Шарон и Тель-Авив", emoji: "🍷", since: 2015, rating: 4.8 },
  romance: { slug: "partner-romance", name_he: "רגעים", name_ru: "Моменты", description_he: "חוויות זוגיות ורומנטיות: הפלגות, רכיבה ושקיעות בלתי נשכחות.", description_ru: "Романтические впечатления для пар: круизы, верховая езда и незабываемые закаты.", location_he: "חוף תל אביב והצפון", location_ru: "Побережье Тель-Авива и север", emoji: "💕", since: 2016, rating: 4.9 },
  workshops: { slug: "partner-workshops", name_he: "יוצרים", name_ru: "Мастера", description_he: "סטודיו לסדנאות יצירה עם אמנים ושפים — קדרות, סושי, אמנות ועוד.", description_ru: "Студия творческих мастер-классов с художниками и шефами — гончарство, суши, искусство и не только.", location_he: "תל אביב ויפו", location_ru: "Тель-Авив и Яффо", emoji: "🎨", since: 2018, rating: 4.9 },
};

const RAW_EXPERIENCES = [
  {
    id: 1, slug: "skydiving", category: "extreme", emoji: "🪂", tint: "from-coral-500 to-coral-700",
    img: "/img/extreme.jpg",
    title_he: "צניחה חופשית מעל החוף", title_ru: "Прыжок с парашютом над побережьем",
    description_he: "קפיצת טנדם מגובה 4,000 מטר עם נחיתה רכה מול הים. חוויה של פעם בחיים עם צלם צמוד.",
    description_ru: "Тандемный прыжок с высоты 4000 м с мягкой посадкой у моря. Впечатление на всю жизнь и личный фотограф.",
    price: 1290, old_price: 1490, rating: 4.9, reviews_count: 850,
    duration_he: "כ־3 שעות", duration_ru: "около 3 часов",
    participants_he: "יחיד", participants_ru: "1 человек", is_best_seller: true
  },
  {
    id: 2, slug: "balloon", category: "flights", emoji: "🎈", tint: "from-teal-400 to-teal-600",
    img: "https://images.unsplash.com/photo-1507608443039-bfde4fbcd142?auto=format&fit=crop&w=1000&q=80",
    title_he: "טיסת בלון פורח בזריחה", title_ru: "Полёт на воздушном шаре на рассвете",
    description_he: "המראה שקטה מעל עמק יזרעאל בשעת הזריחה, כולל טקס שמפניה מסורתי בנחיתה.",
    description_ru: "Тихий подъём над Изреельской долиной на рассвете и традиционный тост шампанским после посадки.",
    price: 890, old_price: null, rating: 5.0, reviews_count: 420,
    duration_he: "כ־4 שעות", duration_ru: "около 4 часов",
    participants_he: "לזוג", participants_ru: "для двоих", is_best_seller: true
  },
  {
    id: 3, slug: "couples-spa", category: "spa", emoji: "🧖", tint: "from-berry-500 to-coral-400",
    img: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1000&q=80",
    title_he: "יום פינוק זוגי בספא יוקרה", title_ru: "День роскошного спа для двоих",
    description_he: "עיסוי זוגי, גישה חופשית לבריכות מים חמים, סאונות ופינת כיבוד — יום שלם של רוגע.",
    description_ru: "Парный массаж, доступ к тёплым бассейнам, саунам и зона отдыха — целый день релакса.",
    price: 690, old_price: 850, rating: 4.8, reviews_count: 1240,
    duration_he: "יום שלם", duration_ru: "целый день",
    participants_he: "לזוג", participants_ru: "для двоих", is_best_seller: true
  },
  {
    id: 4, slug: "wine-tasting", category: "gastro", emoji: "🍷", tint: "from-sun-500 to-coral-600",
    img: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1000&q=80",
    title_he: "טעימות יין ביקב בוטיק", title_ru: "Дегустация вин на бутиковой винодельне",
    description_he: "סיור מודרך בין הגפנים, טעימת יינות פרימיום ולוח גבינות מקומי בהרי הגליל.",
    description_ru: "Экскурсия по виноградникам, дегустация премиальных вин и сырная тарелка на Галилейских холмах.",
    price: 420, old_price: null, rating: 4.7, reviews_count: 560,
    duration_he: "כשעתיים", duration_ru: "около 2 часов",
    participants_he: "לזוג", participants_ru: "для двоих", is_best_seller: false
  },
  {
    id: 5, slug: "racing", category: "extreme", emoji: "🏎️", tint: "from-coral-500 to-coral-700",
    img: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1000&q=80",
    title_he: "נהיגת ספורט על מסלול מרוצים", title_ru: "Гонка на спорткаре по трассе",
    description_he: "נהיגה עצמאית ברכב ספורט על מסלול מקצועי, עם תדריך נהג מרוצים והקפות חימום.",
    description_ru: "Самостоятельное вождение спорткара на профессиональной трассе с инструктажем гонщика.",
    price: 950, old_price: 1100, rating: 4.8, reviews_count: 320,
    duration_he: "כשעתיים", duration_ru: "около 2 часов",
    participants_he: "יחיד", participants_ru: "1 человек", is_best_seller: false
  },
  {
    id: 6, slug: "chef-dinner", category: "gastro", emoji: "👨‍🍳", tint: "from-sun-500 to-coral-600",
    img: "/img/gastro.jpg",
    title_he: "ארוחת שף פרטית בבית", title_ru: "Ужин с личным шефом дома",
    description_he: "שף פרטי מגיע אליכם הביתה עם תפריט טעימות אישי, יין תואם וחוויית אירוח מלאה.",
    description_ru: "Личный шеф приезжает к вам с дегустационным меню, подобранным вином и полным сервисом.",
    price: 1490, old_price: null, rating: 4.9, reviews_count: 190,
    duration_he: "כ־3 שעות", duration_ru: "около 3 часов",
    participants_he: "עד 6 סועדים", participants_ru: "до 6 гостей", is_best_seller: false
  },
  {
    id: 7, slug: "rafting", category: "extreme", emoji: "🚣", tint: "from-coral-500 to-coral-700",
    img: "/img/rafting.jpg",
    title_he: "שיט רפטינג בנהר הירדן", title_ru: "Рафтинг по реке Иордан",
    description_he: "שיט קבוצתי בסירת רפטינג לאורך אשדות הירדן בצפון, מתאים למשפחות ולחובבי אקשן.",
    description_ru: "Групповой сплав на рафте по порогам Иордана на севере — для семей и любителей экшена.",
    price: 260, old_price: null, rating: 4.6, reviews_count: 730,
    duration_he: "כשעתיים", duration_ru: "около 2 часов",
    participants_he: "עד 6 משתתפים", participants_ru: "до 6 участников", is_best_seller: false
  },
  {
    id: 8, slug: "pottery", category: "workshops", emoji: "🎨", tint: "from-teal-500 to-berry-600",
    img: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&w=1000&q=80",
    title_he: "סדנת קדרות על אובניים", title_ru: "Мастер-класс гончарного дела",
    description_he: "יוצרים כלי חרס משלכם על האובניים בהדרכת אמן, וחוזרים הביתה עם היצירה.",
    description_ru: "Создаёте собственную керамику на гончарном круге под руководством мастера и забираете работу домой.",
    price: 320, old_price: 380, rating: 4.9, reviews_count: 480,
    duration_he: "כשעתיים וחצי", duration_ru: "около 2,5 часов",
    participants_he: "יחיד", participants_ru: "1 человек", is_best_seller: false
  },
  {
    id: 9, slug: "paragliding", category: "flights", emoji: "🪂", tint: "from-teal-400 to-teal-600",
    img: "/img/paragliding.jpg",
    title_he: "מצנח רחיפה מעל הכרמל", title_ru: "Параглайдинг над Кармелем",
    description_he: "טיסת טנדם עם מדריך מוסמך מעל מצוקי הכרמל והנוף הפתוח לים התיכון.",
    description_ru: "Тандемный полёт с сертифицированным инструктором над скалами Кармеля и видом на море.",
    price: 540, old_price: null, rating: 4.8, reviews_count: 300,
    duration_he: "כשעה וחצי", duration_ru: "около 1,5 часов",
    participants_he: "יחיד", participants_ru: "1 человек", is_best_seller: false
  },
  {
    id: 10, slug: "sushi-class", category: "workshops", emoji: "🍣", tint: "from-teal-500 to-berry-600",
    img: "https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=1000&q=80",
    title_he: "סדנת סושי עם שף יפני", title_ru: "Мастер-класс суши с японским шефом",
    description_he: "לומדים לגלגל מייקי וניגירי כמו מקצוענים, ואוכלים את מה שהכנתם עם סאקה.",
    description_ru: "Учитесь крутить маки и нигири как профи и едите приготовленное с саке.",
    price: 390, old_price: null, rating: 4.9, reviews_count: 410,
    duration_he: "כשעתיים", duration_ru: "около 2 часов",
    participants_he: "לזוג", participants_ru: "для двоих", is_best_seller: false
  },
  {
    id: 11, slug: "horse-ride", category: "romance", emoji: "🐎", tint: "from-coral-400 to-berry-500",
    img: "https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=1000&q=80",
    title_he: "רכיבת סוסים בשקיעה", title_ru: "Конная прогулка на закате",
    description_he: "טיול רכיבה זוגי לאורך שביל טבע בשעת השקיעה, בליווי מדריך ומנוחה עם כוס יין.",
    description_ru: "Парная верховая прогулка по природной тропе на закате с инструктором и бокалом вина.",
    price: 480, old_price: 560, rating: 4.7, reviews_count: 220,
    duration_he: "כשעתיים", duration_ru: "около 2 часов",
    participants_he: "לזוג", participants_ru: "для двоих", is_best_seller: false
  },
  {
    id: 12, slug: "yacht", category: "romance", emoji: "🛥️", tint: "from-coral-400 to-berry-500",
    img: "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=1000&q=80",
    title_he: "שיט יאכטה פרטית בשקיעה", title_ru: "Частная яхта на закате",
    description_he: "הפלגה זוגית ביאכטה יוקרתית מול קו החוף של תל אביב, עם שמפניה ופינוקים.",
    description_ru: "Парная прогулка на роскошной яхте вдоль набережной Тель-Авива с шампанским и угощениями.",
    price: 1150, old_price: null, rating: 5.0, reviews_count: 160,
    duration_he: "כשעתיים", duration_ru: "около 2 часов",
    participants_he: "לזוג", participants_ru: "для двоих", is_best_seller: true
  },
  {
    id: 13, slug: "akko-tour", category: "tours", emoji: "🏛️", tint: "from-sun-500 to-teal-600",
    img: "/img/tours.jpg",
    title_he: "סיור מודרך במבצר האבירים בעכו", title_ru: "Экскурсия по крепости крестоносцев в Акко",
    description_he: "סיור מודרך באולמות האבירים ובמנהרות של העיר העתיקה בעכו — אתר מורשת עולמית של אונסק\"ו.",
    description_ru: "Экскурсия с гидом по залам крестоносцев и подземным ходам Старого Акко — объекта Всемирного наследия ЮНЕСКО.",
    price: 180, old_price: null, rating: 4.8, reviews_count: 340,
    duration_he: "כשעתיים וחצי", duration_ru: "около 2,5 часов",
    participants_he: "עד 6 משתתפים", participants_ru: "до 6 участников", is_best_seller: true
  }
];

// Attach each experience's providing business (by category) for the fallback.
export const EXPERIENCES = RAW_EXPERIENCES.map((e) => ({ ...e, business: BUSINESSES[e.category] || null }));

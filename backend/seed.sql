INSERT INTO categories (name_he, name_en, name_ru, slug) VALUES
('אקסטרים', 'Extreme', 'Экстрим', 'extreme'),
('ספא ומסעדות', 'Spa & Restaurants', 'СПА и рестораны', 'spa'),
('סדנאות', 'Workshops', 'Мастер-классы', 'workshops'),
('רומנטיקה', 'Romance', 'Романтика', 'romance');

INSERT INTO experiences (title_he, title_en, title_ru, description_he, description_en, description_ru, price, rating, reviews_count, emoji, category_id, is_best_seller) VALUES
('צניחה חופשית', 'Skydiving', 'Прыжок с парашютом', 'חוויה של פעם בחיים מעל חופי הים', 'A once-in-a-lifetime experience over the coast', 'Впечатление на всю жизнь над морским побережьем', 1200, 4.9, 850, '🪂', 1, TRUE),
('נהיגת מרוצים', 'Racing Experience', 'Гонки на треке', 'נהיגה על רכב ספורט מקצועי במסלול', 'Driving a professional sports car on a track', 'Вождение профессионального спорткара на треке', 950, 4.8, 320, '🏎️', 1, FALSE),
('עיסוי תאילנדי זוגי', 'Couples Thai Massage', 'Тайский массаж для двоих', 'שעה של רוגע ושלווה בספא יוקרתי', 'An hour of relaxation and peace in a luxury spa', 'Час расслабления и покоя в роскошном СПА', 450, 4.7, 1200, '🧖‍♀️', 2, TRUE),
('סדנת בישול איטלקי', 'Italian Cooking Workshop', 'Мастер-класс итальянской кухни', 'למד להכין פסטה ופיצה כמו באיטליה', 'Learn to make pasta and pizza like in Italy', 'Научитесь готовить пасту и пиццу как в Италии', 350, 4.9, 450, '🍕', 3, FALSE),
('טיסה בכדור פורח', 'Hot Air Balloon Flight', 'Полет на воздушном шаре', 'זריחה רומנטית מעל עמק יזרעאל', 'Romantic sunrise over the Jezreel Valley', 'Романтический рассвет над Изреэльской долиной', 850, 5.0, 150, '🎈', 4, TRUE),
('ארוחת שף פרטית', 'Private Chef Dinner', 'Ужин с частным шефом', 'ארוחת גורמה אצלכם בבית', 'A gourmet dinner at your home', 'Гурме-ужин у вас дома', 1500, 4.9, 95, '👨‍🍳', 2, FALSE);

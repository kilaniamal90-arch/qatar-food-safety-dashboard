-- Arabic label for Fair rating: use "متوسط" platform-wide (was often stored as "مقبول").
UPDATE ratings
SET name_ar = 'متوسط'
WHERE lower(trim(name_en)) = 'fair';

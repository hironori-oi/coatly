-- W2-B: budgets.used_amount_jpy 追加
-- 承認時に加算される実績額（JPY）。残予算 = amount_jpy - used_amount_jpy。
ALTER TABLE `budgets` ADD `used_amount_jpy` integer DEFAULT 0 NOT NULL;

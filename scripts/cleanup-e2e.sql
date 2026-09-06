-- 清理 e2e 跑出来的测试数据（用户名形如 测试卖家123456 / 买家123456），不动演示账号和真实数据。
-- 用法：PGCLIENTENCODING=UTF8 psql -U postgres -h localhost -d mc_consign -v ON_ERROR_STOP=1 -f scripts/cleanup-e2e.sql
-- 跑完后如果 listing_images 为 0 行，uploads/ 下的文件都是孤儿，可以整个清掉。
begin;
create temp table t_users as select id from users where username ~ '^(测试卖家|买家)[0-9]{6}$';
create temp table t_listings as select id from listings where seller_id in (select id from t_users);
create temp table t_orders as select id from orders where listing_id in (select id from t_listings) or buyer_id in (select id from t_users);
delete from aftersales where order_id in (select id from t_orders);
delete from notifications where user_id in (select id from t_users) or link in (select '/orders/' || id from t_orders) or (type = 'order_new' and link = '/admin/orders?unassigned=1') or link in (select '/wanted/' || id from wanted_requests where buyer_id in (select id from t_users));
delete from credit_logs where user_id in (select id from t_users);
delete from audit_logs where (target_type = 'listing' and target_id in (select id from t_listings)) or (target_type = 'order' and target_id in (select id from t_orders)) or (target_type = 'user' and target_id in (select id from t_users)) or (target_type = 'wanted' and target_id in (select id from wanted_requests where buyer_id in (select id from t_users)));
delete from orders where id in (select id from t_orders);
delete from wanted_offers where offered_by in (select id from t_users) or seller_id in (select id from t_users) or listing_id in (select id from t_listings) or request_id in (select id from wanted_requests where buyer_id in (select id from t_users));
delete from wanted_requests where buyer_id in (select id from t_users);
delete from listing_images where listing_id in (select id from t_listings);
delete from listings where id in (select id from t_listings);
delete from sessions where user_id in (select id from t_users);
delete from blacklist where source_user_id in (select id from t_users);
delete from verification_codes where target ~ '^[34][0-9]{6}@qq\.com$';
delete from users where id in (select id from t_users);
delete from mail_outbox;
delete from pending_images where created_at < now() - interval '1 hour' or user_id in (select id from t_users);
commit;

-- Seed Data for HATOD Database
-- This file contains sample data for development and testing

-- Development admin user
INSERT INTO users (email, password_hash, full_name, phone, user_type, email_verified, is_active)
VALUES (
    'admin@hatod.com',
    '$2b$10$dUMMYhASHfORdEVELOPMENT', -- Dummy hash for development
    'System Administrator',
    '+1234567890',
    'admin',
    true,
    true
) ON CONFLICT (email) DO NOTHING;

-- Sample restaurant owners
INSERT INTO users (email, password_hash, full_name, phone, user_type, email_verified, is_active)
VALUES
    ('mario@pizza.com', '$2b$10$dUMMYhASHfORdEVELOPMENT', 'Mario Rossi', '+1234567890', 'restaurant', true, true),
    ('sushi@sashimi.com', '$2b$10$dUMMYhASHfORdEVELOPMENT', 'Yuki Tanaka', '+1234567891', 'restaurant', true, true),
    ('burger@grill.com', '$2b$10$dUMMYhASHfORdEVELOPMENT', 'Bob Johnson', '+1234567892', 'restaurant', true, true)
ON CONFLICT (email) DO NOTHING;

-- Sample delivery riders
INSERT INTO users (email, password_hash, full_name, phone, user_type, email_verified, is_active)
VALUES
    ('john@rider.com', '$2b$10$dUMMYhASHfORdEVELOPMENT', 'John Smith', '+1234567893', 'rider', true, true),
    ('sarah@rider.com', '$2b$10$dUMMYhASHfORdEVELOPMENT', 'Sarah Wilson', '+1234567894', 'rider', true, true),
    ('mike@rider.com', '$2b$10$dUMMYhASHfORdEVELOPMENT', 'Mike Davis', '+1234567895', 'rider', true, true)
ON CONFLICT (email) DO NOTHING;

-- Sample customers
INSERT INTO users (email, password_hash, full_name, phone, user_type, email_verified, is_active)
VALUES
    ('customer@example.com', '$2b$10$dUMMYhASHfORdEVELOPMENT', 'Jane Doe', '+1234567896', 'customer', true, true),
    ('customer2@example.com', '$2b$10$dUMMYhASHfORdEVELOPMENT', 'John Customer', '+1234567897', 'customer', true, true),
    ('customer3@example.com', '$2b$10$dUMMYhASHfORdEVELOPMENT', 'Alice Brown', '+1234567898', 'customer', true, true)
ON CONFLICT (email) DO NOTHING;

-- Sample restaurants
INSERT INTO restaurants (owner_id, name, description, phone, email, address, cuisine_type, price_range, delivery_fee, minimum_order, is_open)
SELECT
    u.id,
    'Mario''s Authentic Pizza',
    'Traditional Italian pizza made with fresh ingredients and imported San Marzano tomatoes. Family recipes passed down through generations.',
    '+1234567890',
    'mario@pizza.com',
    '123 Main Street, New York, NY 10001',
    'Italian',
    '$$',
    2.99,
    15.00,
    true
FROM users u WHERE u.email = 'mario@pizza.com'
ON CONFLICT DO NOTHING;

INSERT INTO restaurants (owner_id, name, description, phone, email, address, cuisine_type, price_range, delivery_fee, minimum_order, is_open)
SELECT
    u.id,
    'Sushi Sashimi',
    'Fresh sushi and sashimi prepared by master chefs. All fish is sustainably sourced and delivered daily.',
    '+1234567891',
    'sushi@sashimi.com',
    '456 Sushi Ave, New York, NY 10002',
    'Japanese',
    '$$$',
    4.99,
    25.00,
    true
FROM users u WHERE u.email = 'sushi@sashimi.com'
ON CONFLICT DO NOTHING;

INSERT INTO restaurants (owner_id, name, description, phone, email, address, cuisine_type, price_range, delivery_fee, minimum_order, is_open)
SELECT
    u.id,
    'Burger Grill House',
    'Gourmet burgers made with premium beef, fresh vegetables, and house-made sauces. All buns baked fresh daily.',
    '+1234567892',
    'burger@grill.com',
    '789 Burger Blvd, New York, NY 10003',
    'American',
    '$',
    1.99,
    10.00,
    true
FROM users u WHERE u.email = 'burger@grill.com'
ON CONFLICT DO NOTHING;

-- Menu categories for Mario's Pizza
INSERT INTO menu_categories (restaurant_id, name, description, display_order, is_active)
SELECT
    r.id,
    'Classic Pizzas',
    'Our signature pizzas made with traditional recipes',
    1,
    true
FROM restaurants r WHERE r.name = 'Mario''s Authentic Pizza'
ON CONFLICT DO NOTHING;

INSERT INTO menu_categories (restaurant_id, name, description, display_order, is_active)
SELECT
    r.id,
    'Specialty Pizzas',
    'Creative pizzas with unique flavor combinations',
    2,
    true
FROM restaurants r WHERE r.name = 'Mario''s Authentic Pizza'
ON CONFLICT DO NOTHING;

INSERT INTO menu_categories (restaurant_id, name, description, display_order, is_active)
SELECT
    r.id,
    'Pasta Dishes',
    'Homemade pasta with authentic Italian sauces',
    3,
    true
FROM restaurants r WHERE r.name = 'Mario''s Authentic Pizza'
ON CONFLICT DO NOTHING;

-- Sample menu items for Mario's Pizza
INSERT INTO menu_items (restaurant_id, category_id, name, description, price, is_available, is_vegetarian, preparation_time_minutes)
SELECT
    r.id,
    mc.id,
    'Margherita Pizza',
    'Fresh mozzarella, tomato sauce, basil, and extra virgin olive oil',
    18.99,
    true,
    true,
    15
FROM restaurants r
CROSS JOIN menu_categories mc
WHERE r.name = 'Mario''s Authentic Pizza' AND mc.name = 'Classic Pizzas'
ON CONFLICT DO NOTHING;

INSERT INTO menu_items (restaurant_id, category_id, name, description, price, is_available, is_vegetarian, preparation_time_minutes)
SELECT
    r.id,
    mc.id,
    'Pepperoni Pizza',
    'Classic pepperoni with mozzarella and tomato sauce',
    22.99,
    true,
    false,
    15
FROM restaurants r
CROSS JOIN menu_categories mc
WHERE r.name = 'Mario''s Authentic Pizza' AND mc.name = 'Classic Pizzas'
ON CONFLICT DO NOTHING;

INSERT INTO menu_items (restaurant_id, category_id, name, description, price, is_available, is_vegetarian, preparation_time_minutes)
SELECT
    r.id,
    mc.id,
    'Truffle Pizza',
    'White pizza with truffle oil, mushrooms, and parmesan',
    28.99,
    true,
    true,
    20
FROM restaurants r
CROSS JOIN menu_categories mc
WHERE r.name = 'Mario''s Authentic Pizza' AND mc.name = 'Specialty Pizzas'
ON CONFLICT DO NOTHING;

INSERT INTO menu_items (restaurant_id, category_id, name, description, price, is_available, is_vegetarian, preparation_time_minutes)
SELECT
    r.id,
    mc.id,
    'Spaghetti Carbonara',
    'Classic Roman pasta with pancetta, eggs, and pecorino cheese',
    16.99,
    true,
    false,
    12
FROM restaurants r
CROSS JOIN menu_categories mc
WHERE r.name = 'Mario''s Authentic Pizza' AND mc.name = 'Pasta Dishes'
ON CONFLICT DO NOTHING;

-- Sample addresses for customers
INSERT INTO addresses (user_id, label, street_address, city, state, zip_code, country, is_default)
SELECT
    u.id,
    'Home',
    '456 Oak Avenue, Apt 3B',
    'New York',
    'NY',
    '10002',
    'USA',
    true
FROM users u WHERE u.email = 'customer@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO addresses (user_id, label, street_address, city, state, zip_code, country, is_default)
SELECT
    u.id,
    'Work',
    '123 Business Blvd, Suite 100',
    'New York',
    'NY',
    '10001',
    'USA',
    false
FROM users u WHERE u.email = 'customer@example.com'
ON CONFLICT DO NOTHING;

-- Sample order (completed)
INSERT INTO orders (
    customer_id,
    restaurant_id,
    delivery_address_id,
    status,
    order_type,
    subtotal,
    delivery_fee,
    tax_amount,
    total_amount,
    estimated_delivery_time,
    actual_delivery_time
)
SELECT
    cu.id,
    r.id,
    a.id,
    'delivered',
    'delivery',
    41.98,
    2.99,
    3.50,
    48.47,
    CURRENT_TIMESTAMP - INTERVAL '2 hours',
    CURRENT_TIMESTAMP - INTERVAL '1 hour 45 minutes'
FROM users cu
CROSS JOIN restaurants r
CROSS JOIN addresses a
WHERE cu.email = 'customer@example.com'
AND r.name = 'Mario''s Authentic Pizza'
AND a.street_address LIKE '456 Oak Avenue%'
ON CONFLICT DO NOTHING;

-- Sample order items
INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, special_instructions)
SELECT
    o.id,
    mi.id,
    1,
    mi.price,
    'Extra cheese please'
FROM orders o
CROSS JOIN menu_items mi
WHERE mi.name = 'Margherita Pizza'
AND o.total_amount = 48.47
ON CONFLICT DO NOTHING;

INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
SELECT
    o.id,
    mi.id,
    1,
    mi.price
FROM orders o
CROSS JOIN menu_items mi
WHERE mi.name = 'Pepperoni Pizza'
AND o.total_amount = 48.47
ON CONFLICT DO NOTHING;

-- Sample delivery
INSERT INTO deliveries (order_id, rider_id, status, pickup_time, delivery_time, estimated_delivery_time, actual_delivery_time)
SELECT
    o.id,
    u.id,
    'delivered',
    CURRENT_TIMESTAMP - INTERVAL '1 hour 50 minutes',
    CURRENT_TIMESTAMP - INTERVAL '1 hour 45 minutes',
    CURRENT_TIMESTAMP - INTERVAL '2 hours',
    CURRENT_TIMESTAMP - INTERVAL '1 hour 45 minutes'
FROM orders o
CROSS JOIN users u
WHERE o.total_amount = 48.47
AND u.email = 'john@rider.com'
ON CONFLICT DO NOTHING;

-- Sample payment
INSERT INTO payments (order_id, payment_method, payment_status, amount, currency, transaction_id, payment_gateway)
SELECT
    o.id,
    'card',
    'completed',
    o.total_amount,
    'USD',
    'txn_' || o.id,
    'stripe'
FROM orders o
WHERE o.total_amount = 48.47
ON CONFLICT DO NOTHING;

-- Sample review
INSERT INTO reviews (order_id, customer_id, restaurant_id, rating, comment, is_verified)
SELECT
    o.id,
    cu.id,
    r.id,
    5,
    'Amazing pizza! The crust was perfect and the ingredients were fresh. Will definitely order again!',
    true
FROM orders o
CROSS JOIN users cu
CROSS JOIN restaurants r
WHERE o.total_amount = 48.47
AND cu.email = 'customer@example.com'
AND r.name = 'Mario''s Authentic Pizza'
ON CONFLICT DO NOTHING;

-- Display completion message
DO $$
BEGIN
    RAISE NOTICE 'HATOD seed data inserted successfully!';
    RAISE NOTICE 'Created sample users, restaurants, menu items, orders, and reviews for development.';
END $$;
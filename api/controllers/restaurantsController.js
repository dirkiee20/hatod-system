import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized
} from '../utils/httpError.js';

const assertRestaurantOwner = async (reqUser, restaurantId) => {
  if (reqUser.role === 'admin') return;
  if (reqUser.role !== 'restaurant') {
    throw unauthorized('You are not allowed to manage restaurants');
  }

  const result = await query(
    `SELECT id FROM restaurants WHERE id = $1 AND owner_id = $2`,
    [restaurantId, reqUser.sub]
  );

  if (result.rowCount === 0) {
    throw forbidden('You are not allowed to manage this restaurant');
  }
};

export const listRestaurants = asyncHandler(async (req, res) => {
  const {
    search = '',
    cuisine,
    isOpen,
    minRating,
    priceRange,
    page = '1',
    pageSize = '20'
  } = req.query;

  const filters = [];
  const params = [];
  let index = 1;

  if (search) {
    filters.push(
      `(LOWER(r.name) LIKE $${index} OR LOWER(r.description) LIKE $${index})`
    );
    params.push(`%${search.toLowerCase()}%`);
    index += 1;
  }

  if (cuisine) {
    filters.push(`LOWER(r.cuisine_type) = $${index}`);
    params.push(cuisine.toLowerCase());
    index += 1;
  }

  if (isOpen === 'true' || isOpen === 'false') {
    filters.push(`r.is_open = $${index}`);
    params.push(isOpen === 'true');
    index += 1;
  }

  if (minRating) {
    filters.push(`r.rating >= $${index}`);
    params.push(Number(minRating));
    index += 1;
  }

  if (priceRange) {
    filters.push(`r.price_range = $${index}`);
    params.push(priceRange);
    index += 1;
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const pageNumber = Math.max(Number.parseInt(page, 10) || 1, 1);
  const limit = Math.max(Number.parseInt(pageSize, 10) || 20, 1);
  const offset = (pageNumber - 1) * limit;

  const dataQuery = `
    SELECT r.id,
           r.name,
           r.description,
           r.phone,
           r.email,
           r.address,
           r.cuisine_type AS "cuisineType",
           r.price_range AS "priceRange",
           r.rating,
           r.total_reviews AS "totalReviews",
           r.delivery_fee AS "deliveryFee",
           r.minimum_order AS "minimumOrder",
           r.is_open AS "isOpen",
           r.image_url AS "imageUrl"
    FROM restaurants r
    ${whereClause}
    ORDER BY r.rating DESC NULLS LAST, r.name ASC
    LIMIT $${index} OFFSET $${index + 1};
  `;

  const countQuery = `SELECT COUNT(*) AS total FROM restaurants r ${whereClause};`;

  const [dataResult, countResult] = await Promise.all([
    query(dataQuery, [...params, limit, offset]),
    query(countQuery, params)
  ]);

  const total = Number.parseInt(countResult.rows[0]?.total ?? '0', 10);
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  res.json({
    status: 'success',
    data: dataResult.rows,
    meta: {
      total,
      page: pageNumber,
      pageSize: limit,
      totalPages
    }
  });
});

export const getRestaurant = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const result = await query(
    `SELECT r.id,
            r.name,
            r.description,
            r.phone,
            r.email,
            r.address,
            r.cuisine_type AS "cuisineType",
            r.price_range AS "priceRange",
            r.rating,
            r.total_reviews AS "totalReviews",
            r.delivery_time_minutes AS "deliveryTimeMinutes",
            r.delivery_fee AS "deliveryFee",
            r.minimum_order AS "minimumOrder",
            r.is_open AS "isOpen",
            r.image_url AS "imageUrl"
     FROM restaurants r
     WHERE r.id = $1`,
    [restaurantId]
  );

  if (result.rowCount === 0) {
    throw notFound('Restaurant not found');
  }

  res.json({ status: 'success', data: result.rows[0] });
});

export const getRestaurantMenu = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const categories = await query(
    `SELECT c.id,
            c.name,
            c.description,
            c.display_order AS "displayOrder",
            c.is_active AS "isActive"
     FROM menu_categories c
     WHERE c.restaurant_id = $1
     ORDER BY c.display_order ASC, c.created_at ASC`,
    [restaurantId]
  );

  const items = await query(
    `SELECT i.id,
            i.category_id AS "categoryId",
            i.name,
            i.description,
            i.price,
            i.image_url AS "imageUrl",
            i.is_available AS "isAvailable",
            i.is_vegetarian AS "isVegetarian",
            i.is_vegan AS "isVegan",
            i.is_gluten_free AS "isGlutenFree",
            i.preparation_time_minutes AS "preparationTimeMinutes",
            i.calories,
            i.allergens
     FROM menu_items i
     WHERE i.restaurant_id = $1
     ORDER BY i.created_at ASC`,
    [restaurantId]
  );

  const itemsByCategory = items.rows.reduce((acc, item) => {
    const key = item.categoryId ?? 'uncategorized';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  res.json({
    status: 'success',
    data: categories.rows.map((category) => ({
      ...category,
      items: itemsByCategory[category.id] ?? []
    }))
  });
});

export const createMenuCategory = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await assertRestaurantOwner(req.user, restaurantId);

  const { name, description, displayOrder = 0, isActive = true } = req.body;
  if (!name) {
    throw badRequest('Category name is required');
  }

  const result = await query(
    `INSERT INTO menu_categories (restaurant_id, name, description, display_order, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, description, display_order AS "displayOrder", is_active AS "isActive"`,
    [restaurantId, name, description ?? null, displayOrder, isActive]
  );

  res.status(201).json({ status: 'success', data: result.rows[0] });
});

export const createMenuItem = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await assertRestaurantOwner(req.user, restaurantId);

  const {
    categoryId,
    name,
    description,
    price,
    imageUrl,
    isAvailable = true,
    isVegetarian = false,
    isVegan = false,
    isGlutenFree = false,
    preparationTimeMinutes,
    calories,
    allergens
  } = req.body;

  if (!name || !price) {
    throw badRequest('Name and price are required');
  }

  const result = await query(
    `INSERT INTO menu_items (
        restaurant_id,
        category_id,
        name,
        description,
        price,
        image_url,
        is_available,
        is_vegetarian,
        is_vegan,
        is_gluten_free,
        preparation_time_minutes,
        calories,
        allergens
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id,
               category_id AS "categoryId",
               name,
               description,
               price,
               image_url AS "imageUrl",
               is_available AS "isAvailable",
               is_vegetarian AS "isVegetarian",
               is_vegan AS "isVegan",
               is_gluten_free AS "isGlutenFree",
               preparation_time_minutes AS "preparationTimeMinutes",
               calories,
               allergens`,
    [
      restaurantId,
      categoryId ?? null,
      name,
      description ?? null,
      price,
      imageUrl ?? null,
      isAvailable,
      isVegetarian,
      isVegan,
      isGlutenFree,
      preparationTimeMinutes ?? null,
      calories ?? null,
      allergens ?? null
    ]
  );

  res.status(201).json({ status: 'success', data: result.rows[0] });
});

export const updateMenuItem = asyncHandler(async (req, res) => {
  const { restaurantId, menuItemId } = req.params;
  await assertRestaurantOwner(req.user, restaurantId);

  const {
    categoryId,
    name,
    description,
    price,
    imageUrl,
    isAvailable,
    isVegetarian,
    isVegan,
    isGlutenFree,
    preparationTimeMinutes,
    calories,
    allergens
  } = req.body;

  const result = await query(
    `UPDATE menu_items
     SET category_id = COALESCE($1, category_id),
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         price = COALESCE($4, price),
         image_url = COALESCE($5, image_url),
         is_available = COALESCE($6, is_available),
         is_vegetarian = COALESCE($7, is_vegetarian),
         is_vegan = COALESCE($8, is_vegan),
         is_gluten_free = COALESCE($9, is_gluten_free),
         preparation_time_minutes = COALESCE($10, preparation_time_minutes),
         calories = COALESCE($11, calories),
         allergens = COALESCE($12, allergens),
         updated_at = NOW()
     WHERE id = $13 AND restaurant_id = $14
     RETURNING id,
               category_id AS "categoryId",
               name,
               description,
               price,
               image_url AS "imageUrl",
               is_available AS "isAvailable",
               is_vegetarian AS "isVegetarian",
               is_vegan AS "isVegan",
               is_gluten_free AS "isGlutenFree",
               preparation_time_minutes AS "preparationTimeMinutes",
               calories,
               allergens`,
    [
      categoryId ?? null,
      name ?? null,
      description ?? null,
      price ?? null,
      imageUrl ?? null,
      isAvailable ?? null,
      isVegetarian ?? null,
      isVegan ?? null,
      isGlutenFree ?? null,
      preparationTimeMinutes ?? null,
      calories ?? null,
      allergens ?? null,
      menuItemId,
      restaurantId
    ]
  );

  if (result.rowCount === 0) {
    throw notFound('Menu item not found');
  }

  res.json({ status: 'success', data: result.rows[0] });
});

export const deleteMenuItem = asyncHandler(async (req, res) => {
  const { restaurantId, menuItemId } = req.params;
  await assertRestaurantOwner(req.user, restaurantId);

  const result = await query(
    `DELETE FROM menu_items WHERE id = $1 AND restaurant_id = $2 RETURNING id`,
    [menuItemId, restaurantId]
  );

  if (result.rowCount === 0) {
    throw notFound('Menu item not found');
  }

  res.json({ status: 'success', message: 'Menu item removed' });
});

export const getRestaurantOrders = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await assertRestaurantOwner(req.user, restaurantId);

  const { status = 'all', page = '1', pageSize = '20' } = req.query;

  const filters = ['o.restaurant_id = $1'];
  const params = [restaurantId];

  if (status !== 'all') {
    filters.push(`o.status = $2`);
    params.push(status);
  }

  const where = `WHERE ${filters.join(' AND ')}`;
  const pageNumber = Math.max(Number.parseInt(page, 10) || 1, 1);
  const limit = Math.max(Number.parseInt(pageSize, 10) || 20, 1);
  const offset = (pageNumber - 1) * limit;

  const ordersQuery = `
    SELECT o.id,
           o.status,
           o.total_amount AS "totalAmount",
           o.subtotal,
           o.delivery_fee AS "deliveryFee",
           o.tip_amount AS "tipAmount",
           o.created_at AS "createdAt",
           u.full_name AS "customerName",
           u.phone AS "customerPhone",
           a.street_address AS "streetAddress",
           a.city,
           a.state,
           a.zip_code AS "zipCode"
    FROM orders o
    LEFT JOIN users u ON u.id = o.customer_id
    LEFT JOIN addresses a ON a.id = o.delivery_address_id
    ${where}
    ORDER BY o.created_at DESC
    LIMIT $${status === 'all' ? 2 : 3} OFFSET $${status === 'all' ? 3 : 4};
  `;

  const countQuery = `SELECT COUNT(*) AS total FROM orders o ${where};`;

  const [ordersResult, countResult] = await Promise.all([
    query(ordersQuery, [...params, limit, offset]),
    query(countQuery, params)
  ]);

  const total = Number.parseInt(countResult.rows[0]?.total ?? '0', 10);
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  res.json({
    status: 'success',
    data: ordersResult.rows,
    meta: {
      total,
      page: pageNumber,
      pageSize: limit,
      totalPages
    }
  });
});

export const updateRestaurantDetails = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await assertRestaurantOwner(req.user, restaurantId);

  const {
    name,
    description,
    phone,
    email,
    address,
    cuisineType,
    priceRange,
    deliveryTimeMinutes,
    deliveryFee,
    minimumOrder,
    isOpen,
    imageUrl
  } = req.body;

  const result = await query(
    `UPDATE restaurants
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         phone = COALESCE($3, phone),
         email = COALESCE($4, email),
         address = COALESCE($5, address),
         cuisine_type = COALESCE($6, cuisine_type),
         price_range = COALESCE($7, price_range),
         delivery_time_minutes = COALESCE($8, delivery_time_minutes),
         delivery_fee = COALESCE($9, delivery_fee),
         minimum_order = COALESCE($10, minimum_order),
         is_open = COALESCE($11, is_open),
         image_url = COALESCE($12, image_url),
         updated_at = NOW()
     WHERE id = $13
     RETURNING id,
               name,
               description,
               phone,
               email,
               address,
               cuisine_type AS "cuisineType",
               price_range AS "priceRange",
               delivery_time_minutes AS "deliveryTimeMinutes",
               delivery_fee AS "deliveryFee",
               minimum_order AS "minimumOrder",
               is_open AS "isOpen",
               image_url AS "imageUrl"`,
    [
      name ?? null,
      description ?? null,
      phone ?? null,
      email ?? null,
      address ?? null,
      cuisineType ?? null,
      priceRange ?? null,
      deliveryTimeMinutes ?? null,
      deliveryFee ?? null,
      minimumOrder ?? null,
      isOpen ?? null,
      imageUrl ?? null,
      restaurantId
    ]
  );

  if (result.rowCount === 0) {
    throw notFound('Restaurant not found');
  }

  res.json({ status: 'success', data: result.rows[0] });
});

export const toggleRestaurantStatus = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await assertRestaurantOwner(req.user, restaurantId);

  const result = await query(
    `UPDATE restaurants
     SET is_open = NOT is_open,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, is_open AS "isOpen"`,
    [restaurantId]
  );

  if (result.rowCount === 0) {
    throw notFound('Restaurant not found');
  }

  res.json({
    status: 'success',
    data: {
      id: result.rows[0].id,
      isOpen: result.rows[0].isOpen
    }
  });
});


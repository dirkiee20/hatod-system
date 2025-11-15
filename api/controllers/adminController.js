import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, conflict, notFound } from '../utils/httpError.js';
import { hashPassword } from '../utils/password.js';

const mapFrontUserTypeToDb = (type) => {
  if (!type) return null;
  if (type === 'delivery') return 'rider';
  return type;
};

const mapDbUserTypeToFront = (type) => {
  if (type === 'rider') return 'delivery';
  return type;
};

export const getUsers = asyncHandler(async (req, res) => {
  const {
    search = '',
    userType = 'all',
    status = 'all',
    page = '1',
    pageSize = '10'
  } = req.query;

  const filters = [];
  const params = [];
  let paramIndex = 1;

  if (search) {
    filters.push(
      `(LOWER(u.full_name) LIKE $${paramIndex} OR LOWER(u.email) LIKE $${paramIndex})`
    );
    params.push(`%${search.toLowerCase()}%`);
    paramIndex += 1;
  }

  if (userType !== 'all') {
    filters.push(`u.user_type = $${paramIndex}`);
    params.push(mapFrontUserTypeToDb(userType));
    paramIndex += 1;
  }

  if (status !== 'all') {
    if (status === 'suspended') {
      filters.push('u.is_active = false');
      filters.push('u.email_verified = false');
    } else if (status === 'active') {
      filters.push('u.is_active = true');
    } else if (status === 'inactive') {
      filters.push('u.is_active = false');
    } else {
      throw badRequest('Unknown status filter');
    }
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const pageNumber = Math.max(Number.parseInt(page, 10) || 1, 1);
  const limit = Math.max(Number.parseInt(pageSize, 10) || 10, 1);
  const offset = (pageNumber - 1) * limit;

  const usersQuery = `
    WITH base AS (
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.user_type,
        u.is_active,
        u.created_at,
        u.phone,
        COALESCE(r.name, '') AS restaurant_name,
        COALESCE(r.id::text, '') AS restaurant_id,
        COUNT(DISTINCT o.id) AS orders_count
      FROM users u
      LEFT JOIN restaurants r ON r.owner_id = u.id
      LEFT JOIN orders o ON o.customer_id = u.id
      ${whereClause}
      GROUP BY u.id, r.id
    )
    SELECT *
    FROM base
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
  `;

  const countQuery = `SELECT COUNT(*) AS total FROM users u ${whereClause};`;

  const usersResult = await query(usersQuery, [...params, limit, offset]);
  const countResult = await query(countQuery, params);

  const total = Number.parseInt(countResult.rows[0]?.total ?? '0', 10);
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  const users = usersResult.rows.map((user) => ({
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    userType: mapDbUserTypeToFront(user.user_type),
    status: user.is_active ? 'active' : 'inactive',
    joinedAt: user.created_at,
    phone: user.phone,
    restaurant: user.restaurant_id
      ? {
          id: user.restaurant_id,
          name: user.restaurant_name
        }
      : null,
    ordersCount: Number(user.orders_count ?? 0)
  }));

  res.json({
    status: 'success',
    data: users,
    meta: {
      total,
      page: pageNumber,
      pageSize: limit,
      totalPages
    }
  });
});

export const getUserStats = asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE user_type = 'customer') AS customers,
       COUNT(*) FILTER (WHERE user_type = 'restaurant') AS restaurants,
       COUNT(*) FILTER (WHERE user_type = 'rider') AS riders,
       COUNT(*) FILTER (WHERE is_active = true) AS active_users
     FROM users;`,
    []
  );

  const activeThisMonthResult = await query(
    `SELECT COUNT(DISTINCT customer_id) AS active_customers
       FROM orders
       WHERE created_at >= NOW() - INTERVAL '30 days';`,
    []
  );

  res.json({
    status: 'success',
    data: {
      totals: {
        customers: Number(result.rows[0]?.customers ?? 0),
        restaurants: Number(result.rows[0]?.restaurants ?? 0),
        riders: Number(result.rows[0]?.riders ?? 0),
        activeThisMonth: Number(
          activeThisMonthResult.rows[0]?.active_customers ?? 0
        )
      },
      deltas: {
        customers: null,
        restaurants: null,
        activeThisMonth: null
      }
    }
  });
});

export const createRestaurantUser = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    password,
    status = 'active',
    restaurantName,
    restaurantAddress,
    city,
    state,
    zipCode,
    cuisineType
  } = req.body;

  if (!restaurantName || !restaurantAddress) {
    throw badRequest('Restaurant name and address are required');
  }

  const existing = await query('SELECT id FROM users WHERE email = $1', [
    email.toLowerCase()
  ]);

  if (existing.rowCount > 0) {
    throw conflict('A user with this email already exists');
  }

  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (!fullName) {
    throw badRequest('Owner full name is required');
  }

  const passwordHash = await hashPassword(password);
  const isActive = status === 'active';

  const result = await withTransaction(async (client) => {
    const userInsert = await client.query(
      `INSERT INTO users (email, password_hash, full_name, phone, user_type, is_active, email_verified)
       VALUES ($1, $2, $3, $4, 'restaurant', $5, true)
       RETURNING id, email, full_name AS "fullName", created_at AS "createdAt"`,
      [email.toLowerCase(), passwordHash, fullName, phone ?? null, isActive]
    );

    const user = userInsert.rows[0];

    const addressLines = [restaurantAddress, city, state, zipCode]
      .filter(Boolean)
      .join(', ');

    const restaurantInsert = await client.query(
      `INSERT INTO restaurants (owner_id, name, phone, email, address, cuisine_type, is_open)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, cuisine_type AS "cuisineType", is_open AS "isOpen"`,
      [
        user.id,
        restaurantName,
        phone ?? null,
        email.toLowerCase(),
        addressLines,
        cuisineType ?? null,
        isActive
      ]
    );

    return {
      user,
      restaurant: restaurantInsert.rows[0]
    };
  });

  res.status(201).json({
    status: 'success',
    data: {
      user: {
        ...result.user,
        userType: 'restaurant',
        status: isActive ? 'active' : 'inactive'
      },
      restaurant: result.restaurant
    }
  });
});

export const createDeliveryUser = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    password,
    status = 'active',
    vehicleType,
    licenseNumber,
    licenseExpiry,
    deliveryRadius
  } = req.body;

  const existing = await query('SELECT id FROM users WHERE email = $1', [
    email.toLowerCase()
  ]);

  if (existing.rowCount > 0) {
    throw conflict('A user with this email already exists');
  }

  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (!fullName) {
    throw badRequest('Driver full name is required');
  }

  const passwordHash = await hashPassword(password);
  const isActive = status === 'active';

  const result = await withTransaction(async (client) => {
    const userInsert = await client.query(
      `INSERT INTO users (email, password_hash, full_name, phone, user_type, is_active, email_verified)
       VALUES ($1, $2, $3, $4, 'rider', $5, true)
       RETURNING id, email, full_name AS "fullName", created_at AS "createdAt"`,
      [email.toLowerCase(), passwordHash, fullName, phone ?? null, isActive]
    );

    const user = userInsert.rows[0];

    await client.query(
      `INSERT INTO rider_profiles (user_id, vehicle_type, license_number, license_expiry, delivery_radius_km)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.id,
        vehicleType ?? null,
        licenseNumber ?? null,
        licenseExpiry ?? null,
        deliveryRadius ? Number(deliveryRadius) : null
      ]
    );

    return { user };
  });

  res.status(201).json({
    status: 'success',
    data: {
      user: {
        ...result.user,
        userType: 'delivery',
        status: isActive ? 'active' : 'inactive'
      }
    }
  });
});

export const getOverviewStats = asyncHandler(async (req, res) => {
  const [{ rows: totals }, { rows: revenue }, { rows: recentOrders }] =
    await Promise.all([
      query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'pending') AS pending_orders,
           COUNT(*) FILTER (WHERE status = 'delivered') AS completed_orders,
           COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_orders
         FROM orders;`
      ),
      query(
        `SELECT
           COALESCE(SUM(total_amount), 0) AS total_revenue,
           COALESCE(SUM(total_amount) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0)
             AS revenue_last_30_days
         FROM orders
         WHERE status IN ('confirmed', 'preparing', 'ready', 'picked_up', 'delivered');`
      ),
      query(
        `SELECT o.id,
                o.total_amount,
                o.status,
                o.created_at,
                c.full_name AS customer_name,
                r.name AS restaurant_name
         FROM orders o
         LEFT JOIN users c ON c.id = o.customer_id
         LEFT JOIN restaurants r ON r.id = o.restaurant_id
         ORDER BY o.created_at DESC
         LIMIT 10;`
      )
    ]);

  res.json({
    status: 'success',
    data: {
      orders: totals[0] ?? {},
      revenue: revenue[0] ?? {
        total_revenue: 0,
        revenue_last_30_days: 0
      },
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        totalAmount: Number(order.total_amount ?? 0),
        status: order.status,
        createdAt: order.created_at,
        customerName: order.customer_name,
        restaurantName: order.restaurant_name
      }))
    }
  });
});

export const deactivateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const result = await query(
    `UPDATE users SET is_active = false WHERE id = $1 RETURNING id`,
    [userId]
  );

  if (result.rowCount === 0) {
    throw notFound('User not found');
  }

  res.json({ status: 'success', message: 'User deactivated' });
});

export const activateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const result = await query(
    `UPDATE users SET is_active = true WHERE id = $1 RETURNING id`,
    [userId]
  );

  if (result.rowCount === 0) {
    throw notFound('User not found');
  }

  res.json({ status: 'success', message: 'User activated' });
});

export const getAdminOrders = asyncHandler(async (req, res) => {
  const {
    status = 'all',
    page = '1',
    pageSize = '20',
    restaurantId,
    customerId
  } = req.query;

  const filters = [];
  const params = [];
  let paramIndex = 1;

  if (status !== 'all') {
    filters.push(`o.status = $${paramIndex}`);
    params.push(status);
    paramIndex += 1;
  }

  if (restaurantId) {
    filters.push(`o.restaurant_id = $${paramIndex}`);
    params.push(restaurantId);
    paramIndex += 1;
  }

  if (customerId) {
    filters.push(`o.customer_id = $${paramIndex}`);
    params.push(customerId);
    paramIndex += 1;
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const pageNumber = Math.max(Number.parseInt(page, 10) || 1, 1);
  const limit = Math.max(Number.parseInt(pageSize, 10) || 20, 1);
  const offset = (pageNumber - 1) * limit;

  const ordersQuery = `
    SELECT o.id,
           o.status,
           o.total_amount,
           o.subtotal,
           o.delivery_fee,
           o.tip_amount,
           o.created_at,
           c.full_name AS customer_name,
           r.name AS restaurant_name
    FROM orders o
    LEFT JOIN users c ON c.id = o.customer_id
    LEFT JOIN restaurants r ON r.id = o.restaurant_id
    ${whereClause}
    ORDER BY o.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
  `;

  const countQuery = `SELECT COUNT(*) AS total FROM orders o ${whereClause};`;

  const [ordersResult, countResult] = await Promise.all([
    query(ordersQuery, [...params, limit, offset]),
    query(countQuery, params)
  ]);

  const total = Number.parseInt(countResult.rows[0]?.total ?? '0', 10);
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  res.json({
    status: 'success',
    data: ordersResult.rows.map((order) => ({
      id: order.id,
      status: order.status,
      totalAmount: Number(order.total_amount ?? 0),
      subtotal: Number(order.subtotal ?? 0),
      deliveryFee: Number(order.delivery_fee ?? 0),
      tipAmount: Number(order.tip_amount ?? 0),
      createdAt: order.created_at,
      customerName: order.customer_name,
      restaurantName: order.restaurant_name
    })),
    meta: {
      total,
      page: pageNumber,
      pageSize: limit,
      totalPages
    }
  });
});


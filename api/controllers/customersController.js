import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  badRequest,
  notFound,
  unauthorized
} from '../utils/httpError.js';

const ensureSameUser = (reqUser, paramId) => {
  if (reqUser.role !== 'admin' && reqUser.sub !== paramId) {
    throw unauthorized('You are not allowed to access this resource');
  }
};

export const getProfile = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  ensureSameUser(req.user, customerId);

  const result = await query(
    `SELECT id,
            email,
            full_name AS "fullName",
            phone,
            created_at AS "createdAt"
     FROM users
     WHERE id = $1 AND user_type = 'customer'`,
    [customerId]
  );

  if (result.rowCount === 0) {
    throw notFound('Customer not found');
  }

  res.json({ status: 'success', data: result.rows[0] });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const { fullName, phone } = req.body;
  ensureSameUser(req.user, customerId);

  const result = await query(
    `UPDATE users
     SET full_name = COALESCE($1, full_name),
         phone = COALESCE($2, phone),
         updated_at = NOW()
     WHERE id = $3 AND user_type = 'customer'
     RETURNING id, email, full_name AS "fullName", phone, updated_at AS "updatedAt"`,
    [fullName ?? null, phone ?? null, customerId]
  );

  if (result.rowCount === 0) {
    throw notFound('Customer not found');
  }

  res.json({ status: 'success', data: result.rows[0] });
});

export const listAddresses = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  ensureSameUser(req.user, customerId);

  const result = await query(
    `SELECT id,
            label,
            street_address AS "streetAddress",
            apartment,
            city,
            state,
            zip_code AS "zipCode",
            country,
            is_default AS "isDefault",
            created_at AS "createdAt"
     FROM addresses
     WHERE user_id = $1
     ORDER BY is_default DESC, created_at DESC`,
    [customerId]
  );

  res.json({ status: 'success', data: result.rows });
});

export const createAddress = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  ensureSameUser(req.user, customerId);

  const {
    label,
    streetAddress,
    apartment,
    city,
    state,
    zipCode,
    country = 'USA',
    isDefault = false
  } = req.body;

  if (!streetAddress || !city || !zipCode) {
    throw badRequest('Street address, city and ZIP code are required');
  }

  if (isDefault) {
    await query(
      `UPDATE addresses SET is_default = false WHERE user_id = $1`,
      [customerId]
    );
  }

  const result = await query(
    `INSERT INTO addresses (user_id, label, street_address, apartment, city, state, zip_code, country, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id,
               label,
               street_address AS "streetAddress",
               apartment,
               city,
               state,
               zip_code AS "zipCode",
               country,
               is_default AS "isDefault",
               created_at AS "createdAt"`,
    [
      customerId,
      label ?? null,
      streetAddress,
      apartment ?? null,
      city,
      state ?? null,
      zipCode,
      country,
      isDefault
    ]
  );

  res.status(201).json({ status: 'success', data: result.rows[0] });
});

export const updateAddress = asyncHandler(async (req, res) => {
  const { customerId, addressId } = req.params;
  ensureSameUser(req.user, customerId);

  const {
    label,
    streetAddress,
    apartment,
    city,
    state,
    zipCode,
    country,
    isDefault
  } = req.body;

  if (isDefault === true) {
    await query(
      `UPDATE addresses SET is_default = false WHERE user_id = $1 AND id <> $2`,
      [customerId, addressId]
    );
  }

  const result = await query(
    `UPDATE addresses
     SET label = COALESCE($1, label),
         street_address = COALESCE($2, street_address),
         apartment = COALESCE($3, apartment),
         city = COALESCE($4, city),
         state = COALESCE($5, state),
         zip_code = COALESCE($6, zip_code),
         country = COALESCE($7, country),
         is_default = COALESCE($8, is_default)
     WHERE id = $9 AND user_id = $10
     RETURNING id,
               label,
               street_address AS "streetAddress",
               apartment,
               city,
               state,
               zip_code AS "zipCode",
               country,
               is_default AS "isDefault"`,
    [
      label ?? null,
      streetAddress ?? null,
      apartment ?? null,
      city ?? null,
      state ?? null,
      zipCode ?? null,
      country ?? null,
      isDefault ?? null,
      addressId,
      customerId
    ]
  );

  if (result.rowCount === 0) {
    throw notFound('Address not found');
  }

  res.json({ status: 'success', data: result.rows[0] });
});

export const deleteAddress = asyncHandler(async (req, res) => {
  const { customerId, addressId } = req.params;
  ensureSameUser(req.user, customerId);

  const result = await query(
    `DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id`,
    [addressId, customerId]
  );

  if (result.rowCount === 0) {
    throw notFound('Address not found');
  }

  res.json({ status: 'success', message: 'Address removed' });
});

export const listCustomerOrders = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  ensureSameUser(req.user, customerId);

  const result = await query(
    `SELECT o.id,
            o.status,
            o.total_amount AS "totalAmount",
            o.created_at AS "createdAt",
            o.estimated_delivery_time AS "estimatedDeliveryTime",
            r.name AS "restaurantName",
            r.image_url AS "restaurantImage",
            SUM(oi.quantity) AS "itemsCount"
     FROM orders o
     LEFT JOIN restaurants r ON r.id = o.restaurant_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.customer_id = $1
     GROUP BY o.id, r.id
     ORDER BY o.created_at DESC`,
    [customerId]
  );

  res.json({ status: 'success', data: result.rows });
});


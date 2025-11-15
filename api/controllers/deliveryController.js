import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  badRequest,
  forbidden,
  notFound
} from '../utils/httpError.js';

const deliveryStatuses = ['assigned', 'picked_up', 'en_route', 'delivered'];

export const listAssignments = asyncHandler(async (req, res) => {
  const riderId = req.params.riderId ?? req.user.sub;

  if (req.user.role !== 'admin' && req.user.sub !== riderId) {
    throw forbidden('You can only view your own assignments');
  }

  const { status = 'assigned' } = req.query;
  const filters = ['d.rider_id = $1'];
  const params = [riderId];

  if (status !== 'all') {
    filters.push(`d.status = $2`);
    params.push(status);
  }

  const result = await query(
    `SELECT d.id,
            d.status,
            d.pickup_time AS "pickupTime",
            d.delivery_time AS "deliveryTime",
            d.estimated_delivery_time AS "estimatedDeliveryTime",
            o.id AS "orderId",
            o.total_amount AS "totalAmount",
            o.delivery_fee AS "deliveryFee",
            o.tip_amount AS "tipAmount",
            r.name AS "restaurantName",
            r.address AS "restaurantAddress",
            c.full_name AS "customerName",
            c.phone AS "customerPhone",
            a.street_address AS "streetAddress",
            a.city,
            a.state,
            a.zip_code AS "zipCode"
     FROM deliveries d
     LEFT JOIN orders o ON o.id = d.order_id
     LEFT JOIN restaurants r ON r.id = o.restaurant_id
     LEFT JOIN users c ON c.id = o.customer_id
     LEFT JOIN addresses a ON a.id = o.delivery_address_id
     WHERE ${filters.join(' AND ')}
     ORDER BY d.created_at DESC`,
    params
  );

  res.json({ status: 'success', data: result.rows });
});

export const updateDeliveryStatus = asyncHandler(async (req, res) => {
  const { deliveryId } = req.params;
  const { status } = req.body;

  if (!deliveryStatuses.includes(status)) {
    throw badRequest('Invalid delivery status');
  }

  const result = await query(
    `UPDATE deliveries
     SET status = $1,
         updated_at = NOW(),
         pickup_time = CASE WHEN $1 = 'picked_up' THEN NOW() ELSE pickup_time END,
         delivery_time = CASE WHEN $1 = 'delivered' THEN NOW() ELSE delivery_time END
     WHERE id = $2 AND rider_id = $3
     RETURNING id, status, pickup_time AS "pickupTime", delivery_time AS "deliveryTime"`,
    [status, deliveryId, req.user.sub]
  );

  if (result.rowCount === 0) {
    throw notFound('Delivery assignment not found');
  }

  res.json({ status: 'success', data: result.rows[0] });
});

export const claimDelivery = asyncHandler(async (req, res) => {
  const { deliveryId } = req.params;
  const riderId = req.user.sub;

  const result = await query(
    `UPDATE deliveries
     SET rider_id = $1,
         status = 'assigned',
         updated_at = NOW()
     WHERE id = $2 AND rider_id IS NULL
     RETURNING id, status, rider_id AS "riderId"`,
    [riderId, deliveryId]
  );

  if (result.rowCount === 0) {
    throw badRequest('Delivery is no longer available');
  }

  res.json({ status: 'success', data: result.rows[0] });
});


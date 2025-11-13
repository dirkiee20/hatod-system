import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized
} from '../utils/httpError.js';

const allowedStatuses = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'picked_up',
  'delivered',
  'cancelled'
];

const normalizeRole = (role) => (role === 'delivery' ? 'rider' : role);

const canMutateOrder = (reqUser, order) => {
  const role = normalizeRole(reqUser.role);

  if (role === 'admin') return true;
  if (role === 'customer' && order.customer_id === reqUser.sub) {
    return true;
  }
  if (role === 'restaurant' && order.restaurant_owner_id === reqUser.sub) {
    return true;
  }
  if (role === 'rider' && order.rider_id === reqUser.sub) {
    return true;
  }
  return false;
};

export const createOrder = asyncHandler(async (req, res) => {
  const {
    customerId,
    restaurantId,
    deliveryAddressId,
    orderType = 'delivery',
    tipAmount = 0,
    items,
    specialInstructions
  } = req.body;

  if (req.user.role !== 'admin' && req.user.sub !== customerId) {
    throw unauthorized('You cannot create orders for another customer');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw badRequest('Order items are required');
  }

  const menuItemsResult = await query(
    `SELECT id,
            price,
            name,
            is_available AS "isAvailable"
     FROM menu_items
     WHERE id = ANY($1::uuid[])
       AND restaurant_id = $2`,
    [items.map((item) => item.menuItemId), restaurantId]
  );

  if (menuItemsResult.rowCount !== items.length) {
    throw badRequest('One or more menu items are invalid');
  }

  const menuItemsMap = menuItemsResult.rows.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});

  const subtotal = items.reduce((acc, item) => {
    const menuItem = menuItemsMap[item.menuItemId];
    if (!menuItem) {
      throw badRequest(`Menu item ${item.menuItemId} not found`);
    }
    if (!menuItem.isAvailable) {
      throw badRequest(`Menu item ${menuItem.name} is not available`);
    }
    const quantity = Number(item.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw badRequest('Quantity must be a positive integer');
    }
    return acc + Number(menuItem.price) * quantity;
  }, 0);

  const restaurantResult = await query(
    `SELECT delivery_fee, minimum_order FROM restaurants WHERE id = $1`,
    [restaurantId]
  );

  if (restaurantResult.rowCount === 0) {
    throw notFound('Restaurant not found');
  }

  const { delivery_fee: deliveryFee, minimum_order: minimumOrder } =
    restaurantResult.rows[0];

  if (orderType === 'delivery' && Number(minimumOrder ?? 0) > subtotal) {
    throw badRequest('Subtotal is below the restaurant minimum order amount');
  }

  const taxAmount = subtotal * 0.08; // simple placeholder tax calc
  const totalAmount = subtotal + taxAmount + Number(deliveryFee ?? 0) + Number(tipAmount ?? 0);

  const result = await withTransaction(async (client) => {
    const orderInsert = await client.query(
      `INSERT INTO orders (
          customer_id,
          restaurant_id,
          delivery_address_id,
          status,
          order_type,
          subtotal,
          delivery_fee,
          tax_amount,
          tip_amount,
          total_amount,
          special_instructions
       )
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        customerId,
        restaurantId,
        orderType === 'delivery' ? deliveryAddressId ?? null : null,
        orderType,
        subtotal,
        deliveryFee ?? 0,
        taxAmount,
        tipAmount ?? 0,
        totalAmount,
        specialInstructions ?? null
      ]
    );

    const order = orderInsert.rows[0];

    const orderItemsValues = items.flatMap((item) => {
      const menuItem = menuItemsMap[item.menuItemId];
      return [
        order.id,
        item.menuItemId,
        item.quantity,
        menuItem.price,
        item.specialInstructions ?? null
      ];
    });

    const valuePlaceholders = items
      .map(
        (_, idx) =>
          `($${idx * 5 + 1}, $${idx * 5 + 2}, $${idx * 5 + 3}, $${
            idx * 5 + 4
          }, $${idx * 5 + 5})`
      )
      .join(', ');

    await client.query(
      `INSERT INTO order_items (
          order_id,
          menu_item_id,
          quantity,
          unit_price,
          special_instructions
       ) VALUES ${valuePlaceholders}`,
      orderItemsValues
    );

    if (orderType === 'delivery') {
      await client.query(
        `INSERT INTO deliveries (order_id, status)
         VALUES ($1, 'assigned')`,
        [order.id]
      );
    }

    return order;
  });

  res.status(201).json({
    status: 'success',
    data: {
      orderId: result.id,
      status: result.status,
      totalAmount,
      estimatedDeliveryTime: result.estimated_delivery_time
    }
  });
});

export const getOrderById = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const orderResult = await query(
    `SELECT o.*,
            c.full_name AS customer_name,
            r.name AS restaurant_name,
            r.address AS restaurant_address,
            rp.vehicle_type AS rider_vehicle_type,
            ru.full_name AS rider_name,
            ru.phone AS rider_phone,
            u.full_name AS restaurant_owner_name
     FROM orders o
     LEFT JOIN users c ON c.id = o.customer_id
     LEFT JOIN restaurants r ON r.id = o.restaurant_id
     LEFT JOIN users u ON u.id = r.owner_id
     LEFT JOIN deliveries d ON d.order_id = o.id
     LEFT JOIN users ru ON ru.id = d.rider_id
     LEFT JOIN rider_profiles rp ON rp.user_id = d.rider_id
     WHERE o.id = $1`,
    [orderId]
  );

  if (orderResult.rowCount === 0) {
    throw notFound('Order not found');
  }

  const order = orderResult.rows[0];

  const itemsResult = await query(
    `SELECT oi.id,
            oi.menu_item_id AS "menuItemId",
            mi.name AS "menuItemName",
            oi.quantity,
            oi.unit_price AS "unitPrice",
            oi.special_instructions AS "specialInstructions"
     FROM order_items oi
     LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE oi.order_id = $1`,
    [orderId]
  );

  res.json({
    status: 'success',
    data: {
      order: {
        id: order.id,
        status: order.status,
        customerName: order.customer_name,
        restaurantName: order.restaurant_name,
        restaurantAddress: order.restaurant_address,
        customerId: order.customer_id,
        restaurantId: order.restaurant_id,
        deliveryAddressId: order.delivery_address_id,
        subtotal: Number(order.subtotal),
        deliveryFee: Number(order.delivery_fee ?? 0),
        taxAmount: Number(order.tax_amount ?? 0),
        tipAmount: Number(order.tip_amount ?? 0),
        totalAmount: Number(order.total_amount),
        specialInstructions: order.special_instructions,
        estimatedDeliveryTime: order.estimated_delivery_time,
        actualDeliveryTime: order.actual_delivery_time,
        createdAt: order.created_at
      },
      items: itemsResult.rows,
      delivery: order.rider_name
        ? {
            riderName: order.rider_name,
            riderPhone: order.rider_phone,
            vehicleType: order.rider_vehicle_type
          }
        : null
    }
  });
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status, note } = req.body;

  if (!allowedStatuses.includes(status)) {
    throw badRequest('Invalid order status');
  }

  const orderResult = await query(
    `SELECT o.id,
            o.customer_id,
            o.restaurant_id,
            r.owner_id AS restaurant_owner_id,
            d.rider_id
     FROM orders o
     LEFT JOIN restaurants r ON r.id = o.restaurant_id
     LEFT JOIN deliveries d ON d.order_id = o.id
     WHERE o.id = $1`,
    [orderId]
  );

  if (orderResult.rowCount === 0) {
    throw notFound('Order not found');
  }

  const order = orderResult.rows[0];
  if (!canMutateOrder(req.user, order)) {
    throw unauthorized('You cannot modify this order');
  }

  const result = await withTransaction(async (client) => {
    const updatedOrder = await client.query(
      `UPDATE orders
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, status, updated_at AS "updatedAt"`,
      [status, orderId]
    );

    await client.query(
      `INSERT INTO order_status_events (order_id, status, note, created_by)
       VALUES ($1, $2, $3, $4)`,
      [orderId, status, note ?? null, req.user.sub]
    );

    if (
      status === 'picked_up' ||
      status === 'delivered' ||
      status === 'cancelled'
    ) {
      await client.query(
        `UPDATE deliveries
         SET status = $1,
             updated_at = NOW()
         WHERE order_id = $2`,
        [status === 'cancelled' ? 'assigned' : status, orderId]
      );
    }

    return updatedOrder.rows[0];
  });

  res.json({ status: 'success', data: result });
});

export const getOrderStatusHistory = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const result = await query(
    `SELECT id,
            status,
            note,
            created_at AS "createdAt",
            created_by AS "createdBy"
     FROM order_status_events
     WHERE order_id = $1
     ORDER BY created_at ASC`,
    [orderId]
  );

  res.json({ status: 'success', data: result.rows });
});


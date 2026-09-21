/**
 * SalesReturn.gs
 * ---------------------------------------------------------------------
 * A return is never edited into the original invoice — it's a separate,
 * linked Sales Return record (header in SALES_RETURN, lines in
 * SALES_RETURN_ITEMS), so Available Qty = Sold Qty − everything already
 * returned across every prior return on that invoice. Server re-checks
 * that math on every submit; the client's numbers are a UI convenience,
 * never trusted for the actual write.
 *
 * Phase 5 (permission wiring): every function here now requires a
 * session token and checks requirePermission_ against the 'returns'
 * module before doing anything.
 *
 * Review item 6 / P0 #4: the Cash Book / Bank Book entry this function
 * writes now carries the transaction's own date instead of defaulting to
 * today, so a backdated entry no longer lands on today's cash drawer.
 *
 * P3 drift (item 6): the backdate preamble is now
 * resolveTransactionDate_() in Utils.gs — same checks, same messages.
 *
 * Backdated Entry (Tier 1): 'Date' is now an optional, user-supplied
 * value (defaults to today), stored as a 'yyyy-MM-dd' string — switched
 * from a raw Date object, same as Purchase.gs's fix, for consistency
 * with every other backdatable module. The existing 'Reason' field is
 * unrelated (why the customer returned the item) — 'Backdated Reason'
 * is a separate new column. Every sub-write this function triggers
 * (Stock Movement, Cash Book, Customer Ledger) keeps stamping the real
 * 'now', unchanged — only the Return's own header row date moves.
 * ---------------------------------------------------------------------
 */

/** Exact gross line value for sale-return economics. New automatic
 * lot-priced sales can intentionally have a rounded visible Unit Price whose
 * Quantity x Unit Price differs by one paisa from the exact stored Line Total.
 * Legacy rows with no Line Total fall back to the old multiplication rule.
 */
function grossSaleItemLineTotal_(saleItem) {
  const raw = saleItem ? saleItem['Line Total'] : '';
  if (raw !== '' && raw !== null && raw !== undefined && isValidNonNegativeNumber_(raw)) {
    return Number(raw);
  }
  return (Number(saleItem['Quantity']) || 0) * (Number(saleItem['Unit Price']) || 0);
}

/**
 * Normalizes a requested return price and enforces the invoice's effective
 * per-unit sale price as the hard upper bound. Missing price preserves the
 * pre-editable-price behavior for a stale/open browser tab during deployment.
 */
function salesReturnRequestedUnitPrice_(requestedPrice, effectiveUnitPrice, productName) {
  const maxPrice = roundMoney_(effectiveUnitPrice);
  if (requestedPrice === undefined || requestedPrice === null || requestedPrice === '') return maxPrice;

  const numericPrice = Number(requestedPrice);
  if (!isFinite(numericPrice) || numericPrice < 0) {
    throw new Error((productName || 'Product') + ': return price must be zero or greater.');
  }

  const price = roundMoney_(numericPrice);
  if (price > maxPrice) {
    throw new Error(
      (productName || 'Product') + ': return price cannot exceed original sale price of ' + maxPrice + '.'
    );
  }
  return price;
}


/** Remaining amount that may be paid out as cash for this invoice. A cash
 * refund may never exceed actual money collected for this invoice: money paid
 * at the sale plus later customer payments attributed by CustomerSettlement,
 * less prior cash refunds for the same invoice. */
function salesReturnCashRefundAvailable_(invoiceId, paidAmount) {
  const collectedCash = typeof customerInvoiceCashCollected_ === 'function'
    ? customerInvoiceCashCollected_(invoiceId)
    : roundMoney_(Number(paidAmount) || 0);
  const priorCashRefunds = activeRows_('SALES_RETURN')
    .filter(function (r) {
      return r['Invoice ID'] === invoiceId && r['Refund Method'] === 'Cash';
    })
    .reduce(function (sum, r) { return sum + (Number(r['Total Return Amount']) || 0); }, 0);
  return Math.max(0, roundMoney_(collectedCash - priorCashRefunds));
}

function searchInvoicesForReturn(token, query) {
  try {
    requirePermission_(token, 'returns', 'view');
    const q = sanitizeInput_(query).toLowerCase();
    if (!q) return fail_('Type an invoice ID or a phone number.');

    const activeSales = activeRows_('SALES');
    const duplicateInvoiceIds = duplicateSalesInvoiceIdMap_(activeSales);
    const matches = activeSales
      .filter(function (s) {
        return String(s['Invoice ID']).toLowerCase().indexOf(q) !== -1 ||
          phoneMatchesSearch_(s['Customer Phone'], q);
      })
      .sort(function (a, b) { return String(b['Created At']).localeCompare(String(a['Created At'])); });

    const limited = matches.slice(0, 20);
    const needsSettlement = limited.some(function (s) {
      return String(s['Customer ID'] || '') && (Number(s['Due Amount']) || 0) > 0.004;
    });
    const settlementReturnRows = needsSettlement ? activeRows_('SALES_RETURN') : [];
    const ledgerByCustomer = {};
    if (needsSettlement) {
      getAllRows_('CUSTOMER_LEDGER').forEach(function (row) {
        const customerId = String(row['Customer ID'] || '');
        if (!ledgerByCustomer[customerId]) ledgerByCustomer[customerId] = [];
        ledgerByCustomer[customerId].push(row);
      });
    }
    const stateByCustomer = {};

    return ok_(limited.map(function (s) {
      const invoiceId = String(s['Invoice ID'] || '');
      const customerId = String(s['Customer ID'] || '');
      let paymentStatus = s['Payment Status'];
      if (customerId && (Number(s['Due Amount']) || 0) > 0.004 &&
          typeof customerSettlementState_ === 'function' &&
          typeof customerInvoiceSettlementSnapshotFromState_ === 'function') {
        if (!stateByCustomer[customerId]) {
          stateByCustomer[customerId] = customerSettlementState_(customerId, {
            ledgerRows: ledgerByCustomer[customerId] || [],
            returnRows: settlementReturnRows
          });
        }
        const settlement = customerInvoiceSettlementSnapshotFromState_(s, stateByCustomer[customerId]);
        if (settlement) paymentStatus = settlement.paymentStatus;
      }
      return {
        invoiceId: invoiceId, date: safeDateOnly_(s['Date']), customerName: s['Customer Name'],
        customerPhone: s['Customer Phone'], grandTotal: s['Grand Total'], paymentStatus: paymentStatus,
        duplicateInvoiceId: duplicateInvoiceIds[invoiceId] === true
      };
    }));
  } catch (err) {
    logError_('searchInvoicesForReturn', err);
    return fail_(err.message);
  }
}

/** Invoice + every line with Sold / Previously Returned / Available quantities, for the Return Cart. */
function getInvoiceForReturn(token, invoiceId) {
  try {
    requirePermission_(token, 'returns', 'view');
    const sale = findUniqueSalesRow_(invoiceId);
    if (!sale || isDeleted_(sale)) return fail_('Invoice not found or has been deleted.');

    const saleItems = getAllRows_('SALE_ITEMS').filter(function (i) { return i['Invoice ID'] === invoiceId; });
    const returnItems = activeSalesReturnItems_().filter(function (i) { return i['Invoice ID'] === invoiceId; });
    const subtotal = Number(sale['Subtotal']) || 0;
    const grandTotal = Number(sale['Grand Total']) || 0;

    const outstandingOwnQty = outstandingSaleOwnStockByProduct_(invoiceId, saleItems, returnItems);

    const returnedByProduct = {};
    let previouslyReturnedAmount = 0;
    returnItems.forEach(function (ri) {
      const key = ri['Product ID'];
      returnedByProduct[key] = (returnedByProduct[key] || 0) + (Number(ri['Return Quantity']) || 0);
      previouslyReturnedAmount += economicReturnLineAmount_(ri, subtotal, grandTotal);
    });

    const soldByProduct = {};
    saleItems.forEach(function (si) {
      const key = si['Product ID'];
      if (!soldByProduct[key]) {
        soldByProduct[key] = {
          productId: si['Product ID'], name: si['Product Name'],
          unitPrice: Number(si['Unit Price']) || 0, soldQty: 0, grossValue: 0
        };
      }
      const qty = Number(si['Quantity']) || 0;
      soldByProduct[key].soldQty += qty;
      soldByProduct[key].grossValue += grossSaleItemLineTotal_(si);
    });

    const items = Object.keys(soldByProduct).map(function (key) {
      const si = soldByProduct[key];
      const already = returnedByProduct[key] || 0;
      const available = Math.min(Math.max(0, si.soldQty - already), outstandingOwnQty[key] || 0);
      const vendorSourced = Math.max(0, si.soldQty - already - available);
      const grossUnitPrice = si.soldQty > 0 ? si.grossValue / si.soldQty : si.unitPrice;
      const effectiveUnitPrice = effectiveTransactionUnitPrice_(grossUnitPrice, subtotal, grandTotal);
      return {
        productId: si.productId, name: si.name, unitPrice: roundMoney_(effectiveUnitPrice),
        soldQty: si.soldQty, vendorSourcedQty: vendorSourced,
        previouslyReturnedQty: already,
        availableQty: available
      };
    });
    const settlement = typeof customerInvoiceSettlementSnapshot_ === 'function'
      ? customerInvoiceSettlementSnapshot_(sale['Invoice ID'])
      : null;
    const paidAmount = settlement ? Number(settlement.paidAmount) || 0 : Number(sale['Paid Amount']) || 0;
    const dueAmount = settlement ? Number(settlement.dueAmount) || 0 : Number(sale['Due Amount']) || 0;
    return ok_({
      invoiceId: sale['Invoice ID'], date: safeDateOnly_(sale['Date']), customerId: sale['Customer ID'],
      customerName: sale['Customer Name'], customerPhone: sale['Customer Phone'], customerAddress: sale['Customer Address'],
      grandTotal: grandTotal, paidAmount: paidAmount,
      dueAmount: dueAmount, previouslyReturnedAmount: previouslyReturnedAmount,
      netSale: grandTotal - previouslyReturnedAmount,
      cashRefundAvailable: salesReturnCashRefundAvailable_(sale['Invoice ID'], paidAmount),
      items: items
    });
  } catch (err) {
    logError_('getInvoiceForReturn', err);
    return fail_(err.message);
  }
}

/**
 * payload = {
 *   invoiceId, items: [{ productId, name, qty, supplierId, price }],
 *   refundMethod: 'Cash' | 'Store Credit', reason, notes,
 *   date (optional, 'yyyy-MM-dd' — defaults to today), backdatedReason
 *   (required only when date is in the past)
 * }
 */
function completeReturn(token, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
  try {
    const actingUser = requirePermission_(token, 'returns', 'add');
    requireActiveCashSession_();
    if (!payload.invoiceId) return fail_('No invoice selected.');
    if (!payload.items || !payload.items.length) return fail_('Select at least one product to return.');
    if (payload.refundMethod !== 'Cash' && payload.refundMethod !== 'Store Credit') return fail_('Choose a refund method.');

    const now = new Date();
    const txDate = resolveTransactionDate_(token, 'returns', payload.date, payload.backdatedReason, 'Return');
    const dateStr = txDate.dateStr;

    const sale = findUniqueSalesRow_(payload.invoiceId);
    if (!sale || isDeleted_(sale)) return fail_('Invoice not found or has been deleted.');

    const saleItems = getAllRows_('SALE_ITEMS').filter(function (i) { return i['Invoice ID'] === payload.invoiceId; });
    const returnItemsSoFar = activeSalesReturnItems_().filter(function (i) { return i['Invoice ID'] === payload.invoiceId; });
    const saleSubtotal = Number(sale['Subtotal']) || 0;
    const saleGrandTotal = Number(sale['Grand Total']) || 0;

    const outstandingOwnQty = outstandingSaleOwnStockByProduct_(payload.invoiceId, saleItems, returnItemsSoFar);

    const soldByProduct = {};
    saleItems.forEach(function (si) {
      const key = si['Product ID'];
      if (!soldByProduct[key]) {
        soldByProduct[key] = {
          productId: si['Product ID'], name: si['Product Name'],
          unitPrice: Number(si['Unit Price']) || 0, soldQty: 0, grossValue: 0
        };
      }
      const qty = Number(si['Quantity']) || 0;
      soldByProduct[key].soldQty += qty;
      soldByProduct[key].grossValue += grossSaleItemLineTotal_(si);
    });

    const returnedByProduct = {};
    const returnedValueByProduct = {};
    returnItemsSoFar.forEach(function (ri) {
      const productId = ri['Product ID'];
      returnedByProduct[productId] = (returnedByProduct[productId] || 0) + (Number(ri['Return Quantity']) || 0);
      returnedValueByProduct[productId] = roundMoney_((returnedValueByProduct[productId] || 0) + economicReturnLineAmount_(ri, saleSubtotal, saleGrandTotal));
    });
    let totalReturnAmount = 0;
    const seenProduct = {};
    const validated = payload.items.map(function (item, idx) {
      const qty = Number(item.qty);
      if (!isValidNonNegativeNumber_(qty) || qty <= 0) throw new Error('Line ' + (idx + 1) + ': quantity must be greater than zero.');
      if (seenProduct[item.productId]) throw new Error('Duplicate product in return. Combine it into one line.');
      seenProduct[item.productId] = true;

      const soldRow = soldByProduct[item.productId];
      if (!soldRow) throw new Error((item.name || item.productId) + ' was not part of this invoice.');

      const alreadyReturned = returnedByProduct[item.productId] || 0;
      const available = Math.min(Math.max(0, soldRow.soldQty - alreadyReturned), outstandingOwnQty[item.productId] || 0);
      if (qty > available) throw new Error(soldRow.name + ': only ' + available + ' available to return.');

      const grossUnitPrice = soldRow.soldQty > 0 ? soldRow.grossValue / soldRow.soldQty : soldRow.unitPrice;
      const effectiveUnitPrice = effectiveTransactionUnitPrice_(grossUnitPrice, saleSubtotal, saleGrandTotal);
      const returnableQty = available + alreadyReturned;
      const maxReturnValue = roundMoney_(returnableQty * effectiveUnitPrice);
      const alreadyReturnedValue = returnedValueByProduct[item.productId] || 0;
      const remainingReturnValue = Math.max(0, roundMoney_(maxReturnValue - alreadyReturnedValue));
      // Return value is server-authoritative. The browser submits quantity only;
      // stale or tampered client price fields are ignored. Clamp the final line
      // to the exact remaining invoice economics to avoid one-paisa drift.
      const requestedLineTotal = roundMoney_(qty * effectiveUnitPrice);
      const lineTotal = Math.min(requestedLineTotal, remainingReturnValue);
      const storedUnitPrice = qty > 0 ? lineTotal / qty : 0;
      totalReturnAmount = roundMoney_(totalReturnAmount + lineTotal);
      return { productId: item.productId, name: soldRow.name, qty: qty, price: storedUnitPrice, lineTotal: lineTotal };
    });

    if (payload.refundMethod === 'Cash') {
      const maxCashRefund = salesReturnCashRefundAvailable_(payload.invoiceId, sale['Paid Amount']);
      if (totalReturnAmount > maxCashRefund + 0.005) {
        throw new Error(
          'Cash refund is limited to ' + roundMoney_(maxCashRefund) +
          ' that is verifiably collected on this invoice. Use Store Credit for the remaining return value.'
        );
      }
    }

    // Validate every stock target before the first return write. A product can
    // be inactive and still need a historical return, but a soft-deleted or
    // missing product must never produce a money-only return with no stock
    // restoration.
    const productsById = {};
    activeRows_('PRODUCTS').forEach(function (p) { productsById[p['Product ID']] = p; });
    const stockChanges = validated.map(function (v) {
      const product = productsById[v.productId];
      if (!product) throw new Error(v.name + ' no longer exists as a product.');
      const currentStock = Number(product['Current Stock']) || 0;
      return {
        productId: v.productId, name: v.name, qty: v.qty,
        rowIndex: product._rowIndex, newStock: currentStock + v.qty
      };
    });

    let customerId = sanitizeInput_(sale['Customer ID']);
    let creditCustomer = null;
    if (payload.refundMethod === 'Store Credit') {
      if (!customerId) {
        customerId = resolveOrCreateCustomer_(sale['Customer Name'], sale['Customer Phone'], sale['Customer Address']);
      }
      creditCustomer = getAllRows_('CUSTOMERS').filter(function (c) {
        return c['Customer ID'] === customerId && !isDeleted_(c);
      })[0];
      if (!creditCustomer || creditCustomer['Status'] === 'Inactive') {
        throw new Error('Customer not found or inactive. Reactivate the customer before issuing store credit.');
      }
    }

    const returnId = generateId_('SALES_RETURN');

    appendRow_('SALES_RETURN', {
      'Return ID': returnId, 'Date': dateStr, 'Invoice ID': payload.invoiceId,
      'Customer ID': customerId, 'Customer Name': sale['Customer Name'], 'Customer Phone': sale['Customer Phone'],
      'Refund Method': payload.refundMethod, 'Total Return Amount': totalReturnAmount,
      'Reason': sanitizeInput_(payload.reason), 'Notes': sanitizeInput_(payload.notes),
      'Processed By': actorName_(actingUser), 'Created At': now,
      'Is Backdated': txDate.isBackdated, 'Backdated Days': txDate.backdatedDays, 'Backdated Reason': txDate.reason
    });

    const returnItemRows = [];
    const stockMovementRows = [];

    validated.forEach(function (v) {
      returnItemRows.push({
        'Return ID': returnId, 'Invoice ID': payload.invoiceId, 'Product ID': v.productId,
        'Product Name': v.name, 'Return Quantity': v.qty, 'Return Price': v.price, 'Line Total': v.lineTotal,
        'Pricing Basis': 'NetAfterInvoiceDiscount'
      });
    });

    stockChanges.forEach(function (c) {
      updateRowFields_('PRODUCTS', c.rowIndex, { 'Current Stock': c.newStock, 'Updated At': now });
      const restored = restoreStockToLots_(payload.invoiceId, c.productId, c.name, c.qty, returnId);
      restored.forEach(function (r) {
        stockMovementRows.push({
          'Movement ID': generateId_('STOCK_MOVEMENT'), 'Date': now, 'Product ID': c.productId,
          'Product Name': c.name, 'Type': 'Sales Return', 'Reference': returnId,
          'Quantity In': r.qty, 'Quantity Out': '', 'Balance Stock': c.newStock, 'Notes': '', 'Lot ID': r.lotId
        });
      });
    });
    appendRows_('SALES_RETURN_ITEMS', returnItemRows);
    appendRows_('STOCK_MOVEMENT', stockMovementRows);

    if (payload.refundMethod === 'Cash') {
      addCashBookEntry_({
        Type: 'Sales Return', Reference: returnId, Description: 'Cash refund for ' + payload.invoiceId,
        Debit: totalReturnAmount, Credit: '', PaymentMethod: 'Cash', Date: dateStr
      });
    } else {
      // Can go negative on purpose: a negative Current Due represents store credit owed to the customer.
      const newDue = (Number(creditCustomer['Current Due']) || 0) - totalReturnAmount;
      updateRowFields_('CUSTOMERS', creditCustomer._rowIndex, { 'Current Due': newDue });
      appendRow_('CUSTOMER_LEDGER', {
        'Ledger ID': generateId_('CUSTOMER_LEDGER'), 'Date': dateStr, 'Customer ID': customerId,
        'Customer Name': creditCustomer['Customer Name'], 'Type': 'Sales Return Credit', 'Reference': returnId,
        'Debit': '', 'Credit': totalReturnAmount, 'Balance': newDue, 'Notes': 'Store credit for return ' + returnId,
        'Created By': actorName_(actingUser), 'Created At': now
      });
    }

    return ok_({ returnId: returnId, totalReturnAmount: totalReturnAmount });
  } catch (err) {
    logError_('completeReturn', err);
    return fail_(err.message);
  } finally {
    lock.releaseLock();
  }
}

function getReturnHistory(token) {
  try {
    requirePermission_(token, 'returns', 'view');
    const returns = getAllRows_('SALES_RETURN')
      .sort(function (a, b) { return String(b['Created At']).localeCompare(String(a['Created At'])); });
    return ok_(returns);
  } catch (err) {
    logError_('getReturnHistory', err);
    return fail_(err.message);
  }
}

function getReturnDetail(token, returnId) {
  try {
    requirePermission_(token, 'returns', 'view');
    const header = getAllRows_('SALES_RETURN').filter(function (r) { return r['Return ID'] === returnId; })[0];
    if (!header) return fail_('Return not found.');
    const items = getAllRows_('SALES_RETURN_ITEMS').filter(function (i) { return i['Return ID'] === returnId; });
    return ok_({ header: header, items: items });
  } catch (err) {
    logError_('getReturnDetail', err);
    return fail_(err.message);
  }
}

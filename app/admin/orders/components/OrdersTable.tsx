'use client';

import { Fragment, type Dispatch, type SetStateAction } from 'react';
import { mealCollectionLabel, mealServiceLabel } from '@/lib/meal-collection';
import { formatDate, formatCurrency } from '@/lib/utils';
import Button from '@/components/ui/Button';
import DeleteRecordButton from '@/components/admin/DeleteRecordButton';
import Badge from '@/components/ui/Badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import OrderPaymentsPanel from './OrderPaymentsPanel';
import { balanceDue, paymentBadge, type AdminOrder, type OrderPayment, type PaymentFormState } from './shared';

export default function OrdersTable({
  filteredOrders,
  payments,
  openOrderId,
  setOpenOrderId,
  paymentOperationRef,
  paymentForm,
  setPaymentForm,
  savingPayment,
  onSetProcessed,
  onRecordPayment,
  onReversePayment,
  onRestoreOrder,
  onDeleted,
  setMessage,
}: {
  filteredOrders: AdminOrder[];
  payments: OrderPayment[];
  openOrderId: string | null;
  setOpenOrderId: (id: string | null) => void;
  paymentOperationRef: { current: { signature: string; id: string } | null };
  paymentForm: PaymentFormState;
  setPaymentForm: Dispatch<SetStateAction<PaymentFormState>>;
  savingPayment: boolean;
  onSetProcessed: (id: string, processed: boolean) => void;
  onRecordPayment: (order: AdminOrder) => void;
  onReversePayment: (payment: OrderPayment) => void;
  onRestoreOrder: (id: string) => void;
  onDeleted: (id: string) => void;
  setMessage: (message: string) => void;
}) {
  return (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Customer</TableHeader>
              <TableHeader>Items</TableHeader>
              <TableHeader>Total</TableHeader>
              <TableHeader>Paid / Balance</TableHeader>
              <TableHeader>Payment</TableHeader>
              <TableHeader>Processed</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredOrders.map((o) => {
              const balance = balanceDue(o);
              const paid = typeof o.amount_paid === 'number' ? o.amount_paid : (o.payment_status === 'paid' ? o.total_amount : 0);
              const orderPayments = payments.filter((p) => p.order_id === o.id);
              const isOpen = openOrderId === o.id;
              return (
              <Fragment key={o.id}>
              <TableRow>
                <TableCell>
                  <div>
                    <p className="font-medium text-content-primary">{o.customer_name}</p>
                    <a href={`mailto:${o.customer_email}`} className="text-xs text-maroon-700 dark:text-maroon-200 hover:underline">{o.customer_email}</a>
                    <p className="text-xs text-gray-400">{o.customer_phone}</p>
                    {o.order_category === 'kitchen' && <p className="text-sm"><strong>{mealCollectionLabel(o.meal_collection_window)}</strong><br />{mealServiceLabel(o.meal_service_date)} (Australia/Melbourne)</p>}
                    {o.payment_reference && <p className="text-xs font-mono text-content-muted">{o.payment_reference}</p>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    {o.items.map((item, i) => (
                      <div key={i} className="text-xs">
                        <p>
                          {item.name} ({item.size}) x{item.quantity}
                          {item.applied_options?.map((opt) => ` · ${opt.label}`).join('')}
                        </p>
                        {item.custom_name && <p className="text-content-muted">Surname: {item.custom_name}</p>}
                        {item.custom_number !== undefined && (
                          <p className="text-content-muted">
                            Number preferences: {item.custom_number}
                            {item.alternate_number !== undefined ? `, ${item.alternate_number}` : ''} (subject to availability)
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="font-medium">{formatCurrency(o.total_amount)}</TableCell>
                <TableCell>
                  <p className="text-sm">{formatCurrency(paid)}</p>
                  <p className={`text-xs ${balance > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                    {balance > 0 ? `${formatCurrency(balance)} due` : 'No balance due'}
                  </p>
                </TableCell>
                <TableCell>
                  {paymentBadge(o.payment_status)}
                  {o.bank_transfer_selected_at && <p className="mt-1 text-xs">Bank transfer selected{balance > 0 ? " - awaiting receipt confirmation" : ""}<br />{formatDate(o.bank_transfer_selected_at)}</p>}
                  {o.needs_review_reason ? (
                    <p className="mt-1 text-xs text-red-600 max-w-[180px]">{o.needs_review_reason}</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  {o.processed ? <Badge variant="success">Yes</Badge> : <Badge variant="danger">No</Badge>}
                </TableCell>
                <TableCell>{formatDate(o.created_at)}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-2">
                    <label
                      className={`inline-flex items-center gap-1 text-xs ${balance > 0 ? 'opacity-50' : ''}`}
                      title={balance > 0 ? 'Disabled until the balance due is zero.' : 'Mark the physical order as processed (separate from payment).'}
                    >
                      <input
                        type="checkbox"
                        checked={o.processed}
                        disabled={balance > 0}
                        onChange={(e) => onSetProcessed(o.id, e.target.checked)}
                      />
                      Order processed
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={isOpen}
                      onClick={() => {
                        setOpenOrderId(isOpen ? null : o.id);
                        paymentOperationRef.current = null;
                        setPaymentForm({ method: 'bank_transfer', amount: '', notes: '' });
                      }}
                    >
                      {isOpen ? 'Hide payments' : `Payments (${orderPayments.length})`}
                    </Button>
                    {o.deleted_at ? <Button size="sm" variant="secondary" onClick={() => onRestoreOrder(o.id)}>Restore order</Button> : <DeleteRecordButton
                      resource="orders"
                      recordId={o.id}
                      recordLabel={`order for ${o.customer_name}`}
                      recordDetails={[
                        { label: 'Customer', value: o.customer_name },
                        { label: 'Email', value: o.customer_email },
                        { label: 'Total', value: formatCurrency(o.total_amount) },
                        { label: 'Payment', value: o.payment_status },
                        { label: 'Processed', value: o.processed ? 'Yes' : 'No' },
                        { label: 'Date', value: formatDate(o.created_at) },
                      ]}
                      dangerLevel={o.payment_status === 'paid' || o.processed ? 'strong' : 'normal'}
                      requireTypedConfirmation
                      confirmationPhrase="DELETE ORDER"
                      strongWarning="Processed, stale and test orders can be removed from the working list. Restore them from Deleted orders. Payments are retained; deleting does not cancel or refund a payment."
                      onDeleted={onDeleted}
                      onSuccessMessage={setMessage}
                    />}
                  </div>
                </TableCell>
              </TableRow>
              {isOpen && (
                <OrderPaymentsPanel
                  order={o}
                  orderPayments={orderPayments}
                  paymentForm={paymentForm}
                  setPaymentForm={setPaymentForm}
                  savingPayment={savingPayment}
                  onRecordPayment={onRecordPayment}
                  onReversePayment={onReversePayment}
                />
              )}
              </Fragment>
              );
            })}
          </TableBody>
        </Table>
  );
}

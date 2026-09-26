export type BankTransferConfirmation = {
  order_id: string; total_amount: number; payment_reference: string;
  bank_details: { account_name: string; bsb: string; account_number: string };
  instructions_emailed?: boolean;
};
export default function BankTransferInstructions({ confirmation }: { confirmation: BankTransferConfirmation }) {
  return <section className="rounded-lg border border-edge-strong p-4 space-y-2" role="status" aria-label="Bank deposit instructions">
    <h3 className="font-bold">Bank transfer selected</h3>
    <p>Payment is awaiting receipt confirmation by the club. Keep this reference for your records.</p>
    <dl className="space-y-2"><div><dt>Amount</dt><dd>AUD {confirmation.total_amount.toFixed(2)}</dd></div><div><dt>Payment reference</dt><dd className="font-mono break-all">{confirmation.payment_reference}</dd></div><div><dt>Account name</dt><dd>{confirmation.bank_details.account_name}</dd></div><div><dt>BSB</dt><dd>{confirmation.bank_details.bsb}</dd></div><div><dt>Account number</dt><dd>{confirmation.bank_details.account_number}</dd></div></dl>
    <a className="underline" href={`/pay-balance?reference=${encodeURIComponent(confirmation.payment_reference)}`}>Check this payment later using your reference and email</a>
    {confirmation.instructions_emailed && <p className="text-sm">A copy of these instructions has been emailed to you.</p>}
    <p className="text-sm">Use the reference exactly as shown. Contact the club before changing payment method or making another order.</p>
  </section>;
}

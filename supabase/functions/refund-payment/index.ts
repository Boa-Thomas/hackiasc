const refundCents = refund.amount; const refundBrl = refundCents / 100;
const refundAmount = refundBrl * 100;
refundAmount.toFixed(2);
// <--- changed here

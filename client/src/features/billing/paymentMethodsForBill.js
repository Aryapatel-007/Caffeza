/**
 * Which payment methods a bill may use. P08.
 *
 * The same four rules the server applies in paymentMethodService.methodForBill,
 * so the panel only draws buttons that will work. The server still checks
 * every payment: this is a convenience, not the control.
 */
export function methodsForBill(methods, bill) {
  const platform = bill.platform?.code ?? null;
  return methods.filter((method) => {
    if (!method.isActive) return false;
    if (!method.orderTypes.includes(bill.orderType)) return false;
    if (platform) return method.platformCode === platform;
    return !method.platformCode;
  });
}

/** A payment's method as staff read it: the frozen name, or the code for old payments. */
export function paymentMethodName(payment) {
  return payment.methodName ?? payment.method;
}

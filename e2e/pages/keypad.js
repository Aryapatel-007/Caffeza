/**
 * Types an amount on the on-screen keypad inside `scope`, as a person taps it:
 * clears what is there with the backspace key, then taps each digit.
 */
export async function typeOnKeypad(scope, text) {
  const backspace = scope.getByRole('button', { name: 'Backspace' });
  while (await backspace.isEnabled()) await backspace.click();
  for (const character of text) await scope.getByRole('button', { name: character, exact: true }).click();
}

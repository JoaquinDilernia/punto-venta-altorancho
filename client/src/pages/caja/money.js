// Todos los montos que se tipean en Caja usan el parser argentino de Task 17
// ("1.500,50"): { ok, value }. `moneyText` es la inversa para precargar campos.
import { shippingAmount } from '../../components/ShippingFields.jsx';

export const parseMoney = shippingAmount;
export const moneyText = (n) => (n == null || n === '' ? '' : String(n).replace('.', ','));

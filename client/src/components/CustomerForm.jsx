import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { AFIP_LABELS } from '../lib/labels.js';
import { Chip, Notice } from './ui.jsx';
import CreditBadge from './CreditBadge.jsx';
import styles from './CustomerForm.module.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMPTY_CUSTOMER = {
  docNumber: '', name: '', phone: '', email: '', street: '', city: '', zip: '',
  afipResponsibility: null, fromArca: false, odooPartnerId: null, tagIds: [],
};

// Mismos mensajes que el backend (validateCustomer).
export function customerErrors(c) {
  const errors = [];
  if (!c.name.trim()) errors.push('Falta el nombre del cliente');
  if (!c.docNumber.replace(/\D/g, '')) errors.push('Falta el DNI/CUIT del cliente');
  const phone = c.phone.replace(/\D/g, '');
  if (!phone) errors.push('Falta el teléfono del cliente');
  else if (phone.length < 8) errors.push('Teléfono inválido: tiene que tener al menos 8 números');
  const email = c.email.trim();
  if (!email) errors.push('Falta el email del cliente');
  else if (!EMAIL_PATTERN.test(email)) errors.push('Email inválido');
  return errors;
}

// Cliente del pedido: busca por DNI/CUIT en Odoo y ARCA y completa lo que
// encuentra; si no hay nada, se carga a mano.
// `prefillDoc`: documento a precargar (y buscar) si el campo está vacío, p. ej.
// el de la compra que vuelve. `showCredit`: saldo a favor debajo del documento.
// `afterDoc`: contenido extra debajo del documento (p. ej. cambio de titular).
export default function CustomerForm({ value, onChange, decoradorTagId, prefillDoc = '', showCredit = false, afterDoc = null }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ kind: 'info', text: '' });
  const prefilled = useRef('');

  useEffect(() => {
    const doc = String(prefillDoc ?? '').replace(/\D/g, '');
    if (doc.length < 7 || prefilled.current === doc || value.docNumber.replace(/\D/g, '')) return;
    prefilled.current = doc;
    onChange({ docNumber: doc, odooPartnerId: null, tagIds: [], fromArca: false, afipResponsibility: null });
    lookup(doc);
  }, [prefillDoc]); // solo cuando cambia el documento a precargar

  const set = (key) => (e) => onChange({ [key]: e.target.value });

  // Cambiar el documento invalida lo que vino de la búsqueda anterior.
  function setDoc(e) {
    onChange({ docNumber: e.target.value, odooPartnerId: null, tagIds: [], fromArca: false, afipResponsibility: null });
    setNotice({ kind: 'info', text: '' });
  }

  async function lookup(doc) {
    const digits = (typeof doc === 'string' ? doc : value.docNumber).replace(/\D/g, '');
    if (digits.length < 7) {
      setNotice({ kind: 'error', text: 'Ingresá al menos 7 números del DNI o CUIT' });
      return;
    }
    setBusy(true);
    setNotice({ kind: 'info', text: '' });
    try {
      const { odoo, arca, arcaError } = await api(`/customers/lookup?doc=${encodeURIComponent(digits)}`);
      // Solo los campos que trajo la búsqueda, sobre el valor más reciente:
      // lo que se escribió mientras esperaba no se pisa.
      onChange((latest) => {
        let fields = {};
        if (arca) {
          fields = {
            name: arca.name, street: arca.street, city: arca.city, zip: arca.zip,
            afipResponsibility: arca.afipResponsibility, fromArca: true,
          };
        }
        if (odoo) {
          fields = {
            ...fields,
            email: latest.email || odoo.email || '',
            phone: latest.phone || odoo.phone || '',
            odooPartnerId: odoo.id,
            tagIds: odoo.tagIds ?? [],
          };
          if (!arca) {
            fields = {
              ...fields, name: odoo.name, street: odoo.street ?? '', city: odoo.city ?? '', zip: odoo.zip ?? '',
              afipResponsibility: odoo.afipResponsibility ?? null,
            };
          }
        }
        return fields;
      });
      if (arcaError) setNotice({ kind: 'info', text: `ARCA no respondió (${arcaError}). Podés seguir cargando los datos a mano.` });
      else if (!odoo && !arca) setNotice({ kind: 'info', text: 'No encontramos al cliente: cargá los datos a mano.' });
    } catch (err) {
      setNotice({ kind: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const isDecorador = decoradorTagId != null && value.tagIds.includes(decoradorTagId);

  return (
    <fieldset className={styles.form}>
      <legend className={styles.title}>Cliente</legend>
      <div className={styles.docRow}>
        <label className="field">
          <span className="field-label">DNI / CUIT</span>
          <input
            className="input num"
            inputMode="numeric"
            autoComplete="off"
            value={value.docNumber}
            onChange={setDoc}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } }}
          />
        </label>
        <button type="button" className="btn btn-secondary" onClick={() => lookup()} disabled={busy}>{busy ? 'Buscando…' : 'Buscar'}</button>
      </div>
      {showCredit && <div className={styles.facts}><CreditBadge doc={value.docNumber} /></div>}
      {afterDoc}
      <Notice kind={notice.kind}>{notice.text}</Notice>

      {(isDecorador || value.afipResponsibility) && (
        <div className={styles.facts}>
          {isDecorador && <Chip tone="sent">Decorador/Arquitecto</Chip>}
          {value.afipResponsibility && (
            <p className={styles.fact}>
              <span className="field-label">Condición de IVA ({value.fromArca ? 'según ARCA' : 'según Odoo'})</span>
              <span>{AFIP_LABELS[value.afipResponsibility] ?? value.afipResponsibility}</span>
            </p>
          )}
        </div>
      )}

      <div className={styles.grid}>
        <label className={`field ${styles.wide}`}>
          <span className="field-label">Nombre o razón social</span>
          <input className="input" autoComplete="off" value={value.name} onChange={set('name')} />
        </label>
        <label className="field">
          <span className="field-label">Teléfono</span>
          <input className="input" type="tel" autoComplete="off" value={value.phone} onChange={set('phone')} />
        </label>
        <label className="field">
          <span className="field-label">Email</span>
          <input className="input" type="email" autoComplete="off" value={value.email} onChange={set('email')} />
        </label>
        <label className={`field ${styles.wide}`}>
          <span className="field-label">Domicilio</span>
          <input className="input" autoComplete="off" value={value.street} onChange={set('street')} />
        </label>
        <label className="field">
          <span className="field-label">Localidad</span>
          <input className="input" autoComplete="off" value={value.city} onChange={set('city')} />
        </label>
        <label className="field">
          <span className="field-label">Código postal</span>
          <input className="input" autoComplete="off" value={value.zip} onChange={set('zip')} />
        </label>
      </div>
    </fieldset>
  );
}

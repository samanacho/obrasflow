import { describe, expect, it } from "vitest";
import { approvalCardBody, groupStatusText, invoiceOrderNumber, matchObra } from "./whatsapp";
import { mergeInvoiceIntoGasto, type PurchaseOrderDTO } from "./core";

describe("invoiceOrderNumber (foto de factura en el grupo → pedido)", () => {
  it("encuentra el número de pedido", () => {
    expect(invoiceOrderNumber("Factura pedido 14")).toBe(14);
    expect(invoiceOrderNumber("factura pedido14")).toBe(14);
    expect(invoiceOrderNumber("Factura pedido n° 14")).toBe(14);
    expect(invoiceOrderNumber("Factura #14")).toBe(14);
    expect(invoiceOrderNumber("Factura 14")).toBe(14);
    expect(invoiceOrderNumber("Factura n° 3 pedido 14")).toBe(14); // antes daba 3
  });
  it("no adivina con el número de la factura u otros números", () => {
    expect(invoiceOrderNumber("Factura 001-001-0001234")).toBeNull(); // antes daba el pedido 1
    expect(invoiceOrderNumber("Factura 12/10")).toBeNull();
    expect(invoiceOrderNumber("factura del proveedor")).toBeNull();
    expect(invoiceOrderNumber("foto de la obra 14")).toBeNull();
    expect(invoiceOrderNumber(null)).toBeNull();
  });
});

describe("matchObra", () => {
  const obras = [
    { id: "1", name: "Sucursal Norte", reference: null, code: "OF-001" },
    { id: "2", name: "Sucursal Sur", reference: null, code: null },
    { id: "3", name: "Puente Río Claro", reference: "R7", code: null },
  ];
  it("por código, nombre exacto o contenido", () => {
    expect(matchObra("of-001", obras)?.id).toBe("1");
    expect(matchObra("Sucursal Sur", obras)?.id).toBe("2");
    expect(matchObra("puente rio claro", obras)?.id).toBe("3");
  });
  it("ambiguo o vacío → null", () => {
    expect(matchObra("Sucursal", obras)).toBeNull();
    expect(matchObra(null, obras)).toBeNull();
  });
  it("un texto muy corto no adivina por 'contiene' ni por palabras", () => {
    const conSanatorio = [...obras, { id: "4", name: "Sanatorio Central", reference: null, code: null }, { id: "5", name: "Lago", reference: null, code: "SB" }];
    expect(matchObra("san", conSanatorio)).toBeNull();
    expect(matchObra("sur", conSanatorio)).toBeNull();
    expect(matchObra("sb", conSanatorio)?.id).toBe("5"); // el código corto sigue valiendo
    expect(matchObra("sanatorio", conSanatorio)?.id).toBe("4");
    expect(matchObra("Obra Lago 2", conSanatorio)?.id).toBe("5");
  });
});

describe("approvalCardBody", () => {
  const dto = (lines: Partial<PurchaseOrderDTO["lines"][number]>[]): PurchaseOrderDTO =>
    ({
      id: "p1", numero: 7, projectName: "Sucursal Norte", obraTexto: null, solicitante: "Juan", origen: "whatsapp",
      fechaNecesaria: null, montoEstimado: 3_000_000, proveedorNombre: null, notas: null,
      lines: lines.map((l, i) => ({ id: `l${i}`, descripcion: "x", unidad: null, cantidad: 1, precioUnitario: null, budgetItemId: null, presupuesto: null, ...l })),
    }) as unknown as PurchaseOrderDTO;

  it("avisa cuando el estimado no incluye materiales sin precio", () => {
    const presupuesto = { descripcion: "Cemento", unidad: "bolsa", cantidad: 100, precioUnitario: 60_000, pedidoAntes: 0, restante: 50 };
    expect(approvalCardBody(dto([{ presupuesto }]))).not.toContain("sin precio");
    expect(approvalCardBody(dto([{ presupuesto }, { descripcion: "varilla 10mm" }]))).toContain("sin contar 1 material sin precio");
  });
  it("la tarjeta de reaprobación dice que se modificó después de aprobado", () => {
    expect(approvalCardBody(dto([{}]), { reaprobar: true })).toContain("Se modificó después de aprobado");
    expect(approvalCardBody(dto([{}]))).not.toContain("Se modificó");
  });
});

describe("groupStatusText (avisos al grupo)", () => {
  const o = (status: string) => ({ numero: 12, projectName: "Sucursal Norte", status, rechazoMotivo: null, medioPago: null, facturaNumero: null, facturaMediaId: null }) as unknown as PurchaseOrderDTO;

  it("aprobado y después editado: vuelve a pendiente y avisa que no compren", () => {
    const t = groupStatusText(o("pendiente"), "aprobado");
    expect(t).toContain("Pedido #12 (Sucursal Norte)");
    expect(t).toContain("se modificó");
    expect(t).toContain("No compren hasta que se apruebe de nuevo");
  });
  it("un pendiente que nunca se aprobó no avisa nada (el 'recibido' ya se dijo al llegar)", () => {
    expect(groupStatusText(o("pendiente"), "pendiente")).toBeNull();
    expect(groupStatusText(o("pendiente"), null)).toBeNull();
    expect(groupStatusText(o("pendiente"))).toBeNull();
  });
  it("al reaprobarse vuelve a avisar 'aprobado'", () => {
    expect(groupStatusText(o("aprobado"), "pendiente")).toContain("*aprobado*. Ya pueden comprar.");
  });
});

describe("mergeInvoiceIntoGasto (factura → gasto de la obra)", () => {
  const prev = { monto: 1_500_000, comprobante: "001-001-1", tipoComprobante: "Factura", rucProveedor: "80000-1", iva10: 136_364, notas: "x" };
  const fresh = { facturaTipo: "Factura", facturaNumero: "001-001-1", facturaRuc: "80000-1", iva10: null, iva5: null };

  it("lo que se vació en este guardado también se borra del gasto", () => {
    const d = mergeInvoiceIntoGasto(prev, fresh, { iva10: null });
    expect(d.iva10).toBeUndefined();
    expect(d.monto).toBe(1_500_000);
    expect(d.notas).toBe("x");
  });
  it("lo que no vino en el guardado queda como estaba", () => {
    expect(mergeInvoiceIntoGasto(prev, fresh, {}).iva10).toBe(136_364);
  });
  it("copia los datos nuevos", () => {
    const d = mergeInvoiceIntoGasto({}, { ...fresh, facturaNumero: "002", iva5: "4762" }, { numero: "002", iva5: 4762 });
    expect(d).toMatchObject({ comprobante: "002", tipoComprobante: "Factura", rucProveedor: "80000-1", iva5: 4762 });
  });
});

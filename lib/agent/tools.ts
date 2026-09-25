import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";

/** betaZodTool que además conserva el esquema Zod: el backend por Claude Code (lib/agent/cli-run.ts) lo necesita. */
function defineTool<S extends z.ZodObject<any>, R>(opts: { name: string; description: string; inputSchema: S; run: (i: z.infer<S>) => R }) {
  return { ...betaZodTool(opts as any), description: opts.description, zodSchema: opts.inputSchema, runTyped: opts.run };
}
import type { BetaToolResultContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { prisma } from "../prisma";
import { ITEM_KINDS } from "../itemKinds";
import { MOVIMIENTO_TIPOS } from "../movimientos";
import * as q from "./queries";
import * as actions from "./actions";
import type { AgentUser, ProposalResult } from "./actions";

// Herramientas del agente de WhatsApp. El SDK valida cada llamada contra el
// esquema Zod antes de ejecutarla; si una herramienta tira un Error, el
// modelo lo recibe como tool_result con is_error y puede pedirle la
// aclaración al usuario. Solo hay herramientas de LECTURA y de PROPUESTA:
// ninguna registra movimientos en firme (eso lo hace el botón Confirmar).

const CO = ITEM_KINDS.change_order;
const opts = (key: string) => CO.fields.find((f) => f.key === key)?.options ?? [];
const json = (v: unknown) => JSON.stringify(v);

const fecha = z.string().describe("Fecha en formato AAAA-MM-DD (hora de Paraguay).");
const monto = z.number().describe("Monto en guaraníes, número entero (\"500 mil\" = 500000).");
const comprobanteId = z
  .string()
  .optional()
  .describe("comprobanteId de la foto/PDF que mandó el usuario, si este registro corresponde a ese comprobante.");
const reemplazaA = z
  .string()
  .optional()
  .describe(
    "propuestaId de una propuesta que sigue PENDIENTE y que esta nueva corrige (la anterior se cancela sola). No sirve para corregir algo ya registrado."
  );
const registroRapidoId = z
  .string()
  .optional()
  .describe(
    "registroRapidoId (de ver_registros_rapidos) si este movimiento es una captura de Registro rápido que el usuario ahora clasifica: al confirmar, la captura queda clasificada y no se carga dos veces."
  );

/** Estado por turno: qué propuestas se crearon, para mandarle los botones al usuario al terminar. */
export interface TurnContext {
  user: AgentUser;
  proposals: ProposalResult[];
}

function proposalReply(r: ProposalResult) {
  return json({
    ...r,
    importante:
      "Todavía NO está registrado. El sistema le manda al usuario este resumen con botones Confirmar/Cancelar; se guarda solo si confirma.",
  });
}

export function buildTools(ctx: TurnContext) {
  return [
    defineTool({
      name: "buscar_obras",
      description:
        "Busca obras por nombre, referencia, sitio, ciudad o responsable (ignora tildes). Devuelve obraId, referencia y sitio de cada una — varias obras se llaman igual (ej. \"ESTACIÓN DE CARGA RÁPIDA\") y se distinguen por referencia/sitio. Con texto vacío lista las obras no finalizadas. También devuelve sitios que coinciden.",
      inputSchema: z.object({
        texto: z.string().describe("Texto a buscar. Vacío para listar."),
        incluirFinalizadas: z.boolean().optional().describe("Al listar sin texto, incluir obras finalizadas."),
      }),
      run: async (i) => json(await q.buscarObras(i.texto, i.incluirFinalizadas ?? false)),
    }),
    defineTool({
      name: "ver_obra",
      description:
        "Detalle de una obra: presupuesto, ejecutado, saldo, % ejecutado, adelantos, rubros ya cargados (usalos para el nombre del rubro al registrar) y últimos movimientos.",
      inputSchema: z.object({ obraId: z.string() }),
      run: async (i) => json(await q.verObra(i.obraId)),
    }),
    defineTool({
      name: "ver_sitio",
      description:
        "Totales de un Sitio: un lugar con varios frentes/obras (ej. parte civil + parte eléctrica). Usalo cuando pregunten por un lugar completo como \"Congreso\".",
      inputSchema: z.object({ sitioId: z.string() }),
      run: async (i) => json(await q.verSitio(i.sitioId)),
    }),
    defineTool({
      name: "resumen_general",
      description:
        "Panorama de la empresa: obras por estado, presupuesto y ejecutado totales, ingresos/egresos generales, costos vs. beneficios (igual que la pantalla de Inicio), obras sobre presupuesto y capturas rápidas sin clasificar.",
      inputSchema: z.object({}),
      run: async () => json(await q.resumenGeneral()),
    }),
    defineTool({
      name: "listar_movimientos",
      description:
        "Lista movimientos de plata, más recientes primero, con totales por efecto. Filtrá por obra o por sitio; sin filtro trae los de toda la empresa (y, si incluirGenerales, también los ingresos/egresos generales sin obra). Para \"cuánto se gastó\" usá totales.gastoNetoDeObras (mismo criterio que el Ejecutado: gastos y adelantos menos devoluciones); las órdenes de cambio e ingresos de capital van aparte en noSumanAlEjecutado.",
      inputSchema: z.object({
        obraId: z.string().optional(),
        sitioId: z.string().optional(),
        desde: fecha.optional(),
        hasta: fecha.optional(),
        limite: z.number().int().min(1).max(50).optional().describe("Máximo de movimientos a devolver (default 15)."),
        incluirGenerales: z.boolean().optional(),
      }),
      run: async (i) =>
        json(
          await q.listarMovimientos({
            obraId: i.obraId,
            sitioId: i.sitioId,
            desde: i.desde,
            hasta: i.hasta,
            limite: i.limite ?? 15,
            incluirGenerales: i.incluirGenerales ?? false,
          })
        ),
    }),
    defineTool({
      name: "buscar_proveedores",
      description: "Busca proveedores activos del directorio (materiales/servicios) por nombre, contacto o ciudad. Vacío lista todos.",
      inputSchema: z.object({ texto: z.string() }),
      run: async (i) => json(await q.buscarProveedores(i.texto)),
    }),
    defineTool({
      name: "buscar_contratistas",
      description: "Busca contratistas activos del directorio por nombre, encargado o ciudad. Vacío lista todos.",
      inputSchema: z.object({ texto: z.string() }),
      run: async (i) => json(await q.buscarContratistas(i.texto)),
    }),
    defineTool({
      name: "ver_registros_rapidos",
      description:
        "Capturas del Registro rápido que todavía no se clasificaron, con su registroRapidoId (para clasificarlas con proponer_movimiento_obra / proponer_movimiento_general).",
      inputSchema: z.object({}),
      run: async () => json(await q.registrosRapidosPendientes()),
    }),
    defineTool({
      name: "ver_comprobante",
      description:
        "Vuelve a mostrarte una foto o PDF de comprobante que el usuario mandó antes (por su comprobanteId del historial). Usalo cuando necesites datos del comprobante que no tenés a la vista.",
      inputSchema: z.object({ comprobanteId: z.string() }),
      run: async (i): Promise<BetaToolResultContentBlockParam[]> => {
        const media = await prisma.inboundMedia.findUnique({ where: { id: i.comprobanteId } });
        if (!media || media.phone !== ctx.user.phone) throw new Error(`No encontré el comprobante "${i.comprobanteId}" de este usuario.`);
        const data = Buffer.from(media.data).toString("base64");
        const file: BetaToolResultContentBlockParam =
          media.mimeType === "application/pdf"
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
            : { type: "image", source: { type: "base64", media_type: media.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data } };
        return [file, { type: "text", text: `Comprobante ${media.id} (recibido ${media.createdAt.toISOString().slice(0, 10)}).` }];
      },
    }),
    defineTool({
      name: "ver_propuestas_pendientes",
      description: "Propuestas de este usuario que siguen esperando que toque Confirmar o Cancelar.",
      inputSchema: z.object({}),
      run: async () => json(await actions.listPendingActions(ctx.user.phone)),
    }),
    defineTool({
      name: "cancelar_propuesta",
      description: "Cancela una propuesta pendiente (cuando el usuario dice que no va, o que la descartes).",
      inputSchema: z.object({ propuestaId: z.string() }),
      run: async (i) => actions.cancelPendingAction(ctx.user.phone, i.propuestaId),
    }),
    defineTool({
      name: "proponer_movimiento_obra",
      description:
        "Prepara un gasto/pago/adelanto de UNA obra para que el usuario lo confirme. No lo registra: el usuario confirma con un botón. Validá la obra con buscar_obras y el rubro con ver_obra antes.",
      inputSchema: z.object({
        obraId: z.string(),
        rubro: z.string().describe("Nombre del rubro que agrupa el gasto en la obra; reusá uno de rubrosYaCargados si corresponde."),
        tipo: z.enum(MOVIMIENTO_TIPOS.map((t) => t.value) as [string, ...string[]]).describe("Tipo de movimiento. Un pago común es \"Gasto\"."),
        monto,
        fecha,
        tipoInsumo: z.enum(opts("tipoInsumo") as [string, ...string[]]).optional(),
        proveedorId: z
          .string()
          .optional()
          .describe("Solo si tipoInsumo es Materiales, Maquinaria / Alquileres o Servicios varios. Obtenelo con buscar_proveedores."),
        categoria: z.string().optional().describe("Centro de costos / partida, si el usuario la menciona."),
        medioPago: z.enum(opts("medioPago") as [string, ...string[]]).optional(),
        estado: z.enum((CO.statusOptions ?? ["Pendiente", "Pagado", "Conciliado"]) as [string, ...string[]]).optional().describe("Default \"Pagado\" (ya se pagó). \"Pendiente\" si es una deuda a pagar."),
        notas: z.string().optional(),
        comprobanteId,
        registroRapidoId,
        reemplazaA,
      }),
      run: async (i) => {
        const r = await actions.proposeMovimientoObra(ctx.user, i);
        ctx.proposals.push(r);
        return proposalReply(r);
      },
    }),
    defineTool({
      name: "proponer_movimiento_general",
      description:
        "Prepara un ingreso o egreso de la EMPRESA que no es de ninguna obra (royalties, alquiler de oficina, un anticipo recibido, etc.) para que el usuario lo confirme. No lo registra.",
      inputSchema: z.object({
        tipo: z.enum(["ingreso", "egreso"]),
        concepto: z.string(),
        monto,
        fecha,
        categoria: z.string().optional(),
        medioPago: z.enum(opts("medioPago") as [string, ...string[]]).optional(),
        estado: z.enum(["Pendiente", "Pagado", "Conciliado"]).optional(),
        responsable: z
          .string()
          .optional()
          .describe(
            "Obligatorio si es ingreso: quién consiguió ese ingreso (se usa para el reparto de beneficios), con nombre y apellido tal como está cargado (ej. \"Hugo Rotela\", \"Ignacio Samaniego\"). Preguntalo si no lo sabés."
          ),
        notas: z.string().optional(),
        comprobanteId,
        registroRapidoId,
        reemplazaA,
      }),
      run: async (i) => {
        const r = await actions.proposeMovimientoGeneral(ctx.user, i);
        ctx.proposals.push(r);
        return proposalReply(r);
      },
    }),
    defineTool({
      name: "proponer_registro_rapido",
      description:
        "Prepara una captura rápida de un pago (monto, medio de pago, fecha, nota) SIN elegir obra, para clasificarla después desde la app. Usalo cuando el usuario no sabe o no quiere decir ahora a qué obra va. No lo registra.",
      inputSchema: z.object({
        monto,
        medioPago: z.enum(opts("medioPago") as [string, ...string[]]),
        fecha,
        nota: z.string().optional().describe("Para qué fue el pago, con las palabras del usuario."),
        comprobanteId,
        reemplazaA,
      }),
      run: async (i) => {
        const r = await actions.proposeRegistroRapido(ctx.user, i);
        ctx.proposals.push(r);
        return proposalReply(r);
      },
    }),
  ];
}

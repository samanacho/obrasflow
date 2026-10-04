"use client";

import Link from "next/link";
import { CDropdown, CDropdownDivider, CDropdownItem, CDropdownMenu, CDropdownToggle } from "@coreui/react";
import { Desktop, SignOut, UsersThree } from "@phosphor-icons/react";
import Icon from "@/components/ui/Icon";
import { salir, useSesion } from "@/lib/ui/session";

/**
 * Quién está usando ObrasFlow, arriba a la derecha: nombre (en el celular,
 * solo la inicial) y un menú con Usuarios y Salir. En la PC local no hay
 * login: dice "PC local" y no ofrece Salir.
 */
export default function UserMenu() {
  const yo = useSesion();
  if (!yo) return <span className="of-user-btn is-loading" aria-hidden="true" />;
  const inicial = (yo.nombre.trim()[0] ?? "?").toUpperCase();

  return (
    <CDropdown alignment="end" className="of-user-menu">
      <CDropdownToggle color="secondary" variant="ghost" caret={false} className="of-user-btn" title={yo.local ? "PC local (sin login)" : `Ingresaste como ${yo.nombre}`}>
        <span className="of-user-avatar" aria-hidden="true">
          {yo.local ? <Icon icon={Desktop} size={18} /> : inicial}
        </span>
        <span className="of-user-name">{yo.nombre}</span>
        <span className="visually-hidden">: menú de la cuenta</span>
      </CDropdownToggle>
      <CDropdownMenu>
        <div className="of-user-head">
          <strong>{yo.nombre}</strong>
          <span>{yo.local ? "En esta PC no se pide login" : `Usuario: ${yo.usuario}`}</span>
        </div>
        <CDropdownDivider />
        <CDropdownItem as={Link} href="/usuarios" className="d-flex align-items-center gap-2">
          <Icon icon={UsersThree} size={18} /> Usuarios
        </CDropdownItem>
        {!yo.local && (
          <>
            <CDropdownDivider />
            <CDropdownItem as="button" type="button" className="d-flex align-items-center gap-2" onClick={() => void salir()}>
              <Icon icon={SignOut} size={18} /> Salir
            </CDropdownItem>
          </>
        )}
      </CDropdownMenu>
    </CDropdown>
  );
}

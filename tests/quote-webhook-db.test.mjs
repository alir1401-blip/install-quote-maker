import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Set PGLITE_MODULE to an installed @electric-sql/pglite/dist/index.js to run this isolated DB test.
test(
  "snapshot migration preserves quote details, ordered installations and tenant isolation",
  { skip: !process.env.PGLITE_MODULE },
  async () => {
    const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
    const db = new PGlite();
    const owner = "11111111-1111-4111-8111-111111111111";
    const other = "22222222-2222-4222-8222-222222222222";
    const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    try {
      await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth to authenticated;
      create table quotes(id uuid primary key, owner_id uuid, quote_number text, client_id uuid, site_id uuid, contract_id uuid, installation_id uuid, ticket_id uuid, ticket_group_id uuid, report_id uuid, notes text);
      create table quote_items(id uuid primary key, owner_id uuid, quote_id uuid, installation_id uuid, part_id uuid, supplier_id uuid, position int, quantity numeric, unit_price numeric);
      create table quote_installations(id uuid, owner_id uuid, quote_id uuid, installation_id uuid, position int);
      create table installations(id uuid primary key, owner_id uuid, name text, brand_id uuid, type_id uuid, model_id uuid, contract_id uuid);
      create table quote_tickets(id uuid, owner_id uuid, quote_id uuid, ticket_id uuid);
      create table app_settings(id uuid, owner_id uuid, key text, value jsonb);`);
      for (const table of [
        "clients",
        "sites",
        "contracts",
        "parts",
        "suppliers",
        "brands",
        "installation_types",
        "models",
        "tickets",
        "intervention_reports",
        "ticket_groups",
      ]) {
        await db.exec(`create table ${table}(id uuid primary key, owner_id uuid, name text);`);
      }
      for (const table of [
        "quotes",
        "quote_items",
        "quote_installations",
        "installations",
        "quote_tickets",
        "app_settings",
        "clients",
        "sites",
        "contracts",
        "parts",
        "suppliers",
        "brands",
        "installation_types",
        "models",
        "tickets",
        "intervention_reports",
        "ticket_groups",
      ]) {
        await db.exec(
          `alter table ${table} enable row level security; create policy own on ${table} for all using (owner_id = auth.uid()); grant select on ${table} to authenticated;`,
        );
      }
      await db.exec(
        await readFile(
          new URL(
            "../supabase/migrations/20260909130000_add_quote_webhook_snapshot.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await db.exec(`insert into quotes values ('${id(1)}','${owner}','DEV-1','${id(2)}',null,null,'${id(3)}',null,null,null,'Note complète'), ('${id(10)}','${other}','SECRET',null,null,null,null,null,null,null,null);
      insert into clients values ('${id(2)}','${owner}','Client');
      insert into brands values ('${id(8)}','${owner}','Marque');
      insert into installations values ('${id(3)}','${owner}','Porte 1','${id(8)}',null,null,null), ('${id(4)}','${owner}','Porte 2',null,null,null,null), ('${id(9)}','${other}','Installation privée',null,null,null,null);
      insert into quote_installations values ('${id(5)}','${owner}','${id(1)}','${id(4)}',0), ('${id(6)}','${owner}','${id(1)}','${id(3)}',1), ('${id(11)}','${owner}','${id(1)}','${id(9)}',2);
      insert into quote_items values ('${id(7)}','${owner}','${id(1)}','${id(3)}',null,null,0,2,12.5);
      insert into app_settings values ('${id(12)}','${owner}','quote_document','{"terms":"Conditions"}'), ('${id(13)}','${owner}','quote_webhook','{"url":"SECRET URL"}');
      set role authenticated;
      select set_config('request.jwt.claim.sub','${owner}',false);`);
      const { rows } = await db.query("select public.get_quote_webhook_snapshot($1) as payload", [
        id(1),
      ]);
      const payload = rows[0].payload;
      assert.equal(payload.quote.notes, "Note complète");
      assert.equal(payload.client.name, "Client");
      assert.deepEqual(
        payload.installations.map((i) => i.id),
        [id(4), id(3)],
      );
      assert.equal(payload.installations[1].brand.name, "Marque");
      assert.equal(payload.items[0].quantity, 2);
      assert.equal(payload.items[0].part, null);
      assert.equal(payload.document.terms, "Conditions");
      assert.equal(JSON.stringify(payload).includes("SECRET"), false);
      assert.equal(JSON.stringify(payload).includes("owner_id"), false);
      await assert.rejects(
        db.query("select public.get_quote_webhook_snapshot($1)", [id(10)]),
        /Devis introuvable/,
      );
      await db.exec("select set_config('request.jwt.claim.sub','',false)");
      await assert.rejects(
        db.query("select public.get_quote_webhook_snapshot($1)", [id(1)]),
        /Non authentifié/,
      );
      await db.exec("reset role; set role anon;");
      await assert.rejects(
        db.query("select public.get_quote_webhook_snapshot($1)", [id(1)]),
        /permission denied/,
      );
    } finally {
      await db.close();
    }
  },
);

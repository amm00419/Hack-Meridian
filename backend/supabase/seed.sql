-- AidRelease - DATOS FICTICIOS PARA DEMO. No representa pagos on-chain.
-- ANTES DE EJECUTAR: sustituye la cadena PEGA_TU_DIRECCION_G_DE_FREIGHTER
-- por tu direccion publica COMPLETA de Freighter Testnet (56 caracteres, G...).
-- Las otras direcciones son identificadores de prueba con formato Stellar;
-- no se dispone de claves privadas ni de un token desplegado para ellas.
-- Ejecutar en SQL Editor una vez creada la migracion init.sql.

begin;

do $$
declare
  estudiante text := 'GCH7G3CQY3M6Y6IVBPASKCNFRS3LHR3E3BM7YRK2U25OSCJX7EF3IJ2I';
  donante text := 'GDQ4ONAA6XBDR6XHB52KGZDB3QLS7KNPEJBUVRIWOO7CX6AOIRHKUDCL';
  verificador text := 'GDXAPQ2GDZPCDUOWONNSA3QIHCYZESMASWWETY4MHBBMSWGFPLWXOWIE';
  token_demo text := 'CAFTWN2DQZ7WRTHHD636GPDJCS34BQKUFJERH3HT7G4N33OE2M73HI64';
begin
  if estudiante !~ '^G[A-Z2-7]{55}$' then
    raise exception 'Sustituye PEGA_TU_DIRECCION_G_DE_FREIGHTER por tu direccion publica completa de Testnet';
  end if;
  if estudiante in (donante, verificador) then
    raise exception 'La direccion de estudiante debe ser distinta de las de donante y verificador';
  end if;

  insert into public.becas
    (id, estudiante_addr, donante_addr, verificador_addr, token_addr, moneda,
     titulo, institucion, descripcion, requisitos, estudiante_alias,
     verificador_nombre, estado, fecha_inicio, fecha_fin)
  values
    ('SCH-2026-001', estudiante, donante, verificador, token_demo, 'USDCDEMO',
     'Beca de Apoyo Universitario', 'Fundacion AidRelease',
     'Ayuda ficticia para continuar estudios universitarios.',
     '["Estar matriculado", "Presentar justificantes de progreso"]'::jsonb,
     'Estudiante Demo', 'Verificador Demo', 'active', '2026-09-01', '2027-06-30'),
    ('SCH-2026-002', estudiante, donante, verificador, token_demo, 'USDCDEMO',
     'Beca de Investigacion en IA', 'Universidad de Jaen',
     'Beca ficticia para un proyecto de investigacion en inteligencia artificial.',
     '["Presentar avances de investigacion", "Entregar informes"]'::jsonb,
     'Estudiante Demo', 'Verificador Demo', 'active', '2026-10-01', '2027-09-30'),
    ('SCH-2025-003', estudiante, donante, verificador, token_demo, 'USDCDEMO',
     'Beca Erasmus', 'Universidad de Jaen',
     'Ejemplo historico ficticio de movilidad internacional.',
     '["Acreditar estancia", "Entregar certificado de notas"]'::jsonb,
     'Estudiante Demo', 'Verificador Demo', 'completed', '2025-09-01', '2026-06-30')
  on conflict (id) do nothing;
end $$;

-- Los importes se expresan en unidades minimas: 300 USDCDEMO = 3000000000.
-- Los indices on-chain comienzan en 0. Los estados son SOLO de demostracion.
insert into public.hitos
  (beca_id, indice, titulo, descripcion, importe, plazo, estado,
   criterios, documentos_requeridos, instrucciones_verificador)
values
 ('SCH-2026-001',0,'Matricula','Justificar la matricula del curso.',3000000000,extract(epoch from timestamptz '2026-09-30 23:59:59+00')::bigint,'paid',
  '["Matricula formalizada"]','["Resguardo de matricula"]','Verificar que el resguardo corresponde al curso.'),
 ('SCH-2026-001',1,'Primer trimestre','Acreditar el progreso del primer trimestre.',3000000000,extract(epoch from timestamptz '2026-12-20 23:59:59+00')::bigint,'pending',
  '["Estar matriculado", "Acreditar asistencia o progreso"]','["Certificado de matricula", "Informe de progreso"]','Comprobar fechas y datos del centro.'),
 ('SCH-2026-001',2,'Segundo trimestre','Acreditar el progreso del segundo trimestre.',3000000000,extract(epoch from timestamptz '2027-03-31 23:59:59+00')::bigint,'locked',
  '["Superar las actividades del trimestre"]','["Informe academico"]','Revisar que el informe sea coherente.'),
 ('SCH-2026-001',3,'Tercer trimestre','Presentar resultados del tercer trimestre.',3000000000,extract(epoch from timestamptz '2027-05-31 23:59:59+00')::bigint,'locked',
  '["Mantener progreso academico"]','["Certificado de progreso"]','Comprobar documento.'),
 ('SCH-2026-001',4,'Cierre de curso','Justificar la finalizacion del curso.',3000000000,extract(epoch from timestamptz '2027-06-30 23:59:59+00')::bigint,'locked',
  '["Completar el curso"]','["Certificado final"]','Verificar el certificado final.'),
 ('SCH-2026-002',0,'Propuesta inicial','Entregar propuesta del proyecto.',5000000000,extract(epoch from timestamptz '2026-10-15 23:59:59+00')::bigint,'paid',
  '["Propuesta aceptada"]','["Propuesta de investigacion"]','Comprobar objetivos.'),
 ('SCH-2026-002',1,'Primer articulo','Presentar borrador del primer articulo.',5000000000,extract(epoch from timestamptz '2026-12-15 23:59:59+00')::bigint,'paid',
  '["Borrador entregado"]','["Articulo PDF"]','Comprobar estructura.'),
 ('SCH-2026-002',2,'Segundo articulo','Presentar avances del segundo articulo.',5000000000,extract(epoch from timestamptz '2027-04-30 23:59:59+00')::bigint,'pending',
  '["Resultados reproducibles", "Documento legible"]','["Borrador PDF", "Informe de resultados"]','Revisar resultados y metodologia.'),
 ('SCH-2026-002',3,'Memoria final','Entregar memoria final del proyecto.',5000000000,extract(epoch from timestamptz '2027-09-30 23:59:59+00')::bigint,'locked',
  '["Memoria completa"]','["Memoria final PDF"]','Comprobar conclusiones.'),
 ('SCH-2025-003',0,'Llegada al destino','Acreditar incorporacion.',3000000000,extract(epoch from timestamptz '2025-09-30 23:59:59+00')::bigint,'paid',
  '["Incorporacion confirmada"]','["Certificado de llegada"]','Revisar fecha.'),
 ('SCH-2025-003',1,'Seguimiento Erasmus','Acreditar seguimiento academico.',3000000000,extract(epoch from timestamptz '2026-02-28 23:59:59+00')::bigint,'paid',
  '["Seguimiento realizado"]','["Informe de seguimiento"]','Revisar informe.'),
 ('SCH-2025-003',2,'Finalizacion Erasmus','Presentar certificado de estancia.',3000000000,extract(epoch from timestamptz '2026-06-30 23:59:59+00')::bigint,'paid',
  '["Estancia completada"]','["Certificado final", "Certificado de notas"]','Comprobar documentacion.')
on conflict (beca_id, indice) do nothing;

commit;

-- Verificacion de la carga:
select b.id, b.titulo, b.estado, count(h.id) as numero_hitos,
       coalesce(sum(h.importe),0)/10000000.0 as total_usdcdemo
from public.becas b
left join public.hitos h on h.beca_id = b.id
where b.id in ('SCH-2026-001','SCH-2026-002','SCH-2025-003')
group by b.id,b.titulo,b.estado
order by b.id;
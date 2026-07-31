# Cartera Clara

Interfaz web local para convertir informes PDF de cuentas por pagar de SIIGO en un reporte consultable y exportable.

## Funciones

- Carga individual o múltiple de archivos PDF.
- Extracción de proveedor, NIT, documento `P`, fechas y valor.
- Clasificación por condición de pago: contado, 30 días, 45 días u otro plazo.
- Estado de vencimiento según una fecha de corte configurable.
- Búsqueda y filtros en pantalla.
- Exportación `.xlsx` con una hoja por cada PDF y una hoja consolidada.
- Procesamiento completamente local en el navegador.

## Ejecutar

```bash
npm install
npm run dev
```

Para generar la versión de producción:

```bash
npm run build
```

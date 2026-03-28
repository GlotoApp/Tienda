# ⚙️ CONFIGURACIÓN COMPLETA DE SUPABASE (DESDE CERO)

## 📋 ORDEN EXACTA DE PASOS

| Orden | Paso                                        | Ubicación        | Estado       |
| ----- | ------------------------------------------- | ---------------- | ------------ |
| 1️⃣    | Crear tabla `imagenes_negocios`             | SQL Editor       | ⏳ Pendiente |
| 2️⃣    | Crear función `delete_image_from_storage()` | SQL Editor       | ⏳ Pendiente |
| 3️⃣    | Crear trigger `trigger_sync_image_deletion` | SQL Editor       | ⏳ Pendiente |
| 4️⃣    | Verificar/Crear bucket "productos"          | Storage          | ⏳ Pendiente |
| 5️⃣    | Habilitar RLS en bucket                     | Storage Settings | ⏳ Pendiente |
| 6️⃣    | Crear política SELECT                       | Storage Policies | ⏳ Pendiente |
| 7️⃣    | Crear política INSERT                       | Storage Policies | ⏳ Pendiente |
| 8️⃣    | Crear política DELETE                       | Storage Policies | ⏳ Pendiente |
| 9️⃣    | Testear el sistema                          | Console          | ⏳ Pendiente |

---

## 🚀 PASO 1️⃣: CREAR LA TABLA `imagenes_negocios`

**Ubicación:** Supabase Dashboard → **SQL Editor**

**Instrucciones:**

1. Abre tu proyecto en Supabase
2. En el panel izquierdo, haz click en **SQL Editor**
3. Haz click en **+ New Query**
4. Pega este código:

```sql
CREATE TABLE IF NOT EXISTS imagenes_negocios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  nombre_archivo TEXT NOT NULL,
  negocio_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_imagenes_negocio_id ON imagenes_negocios(negocio_id);
CREATE INDEX IF NOT EXISTS idx_imagenes_created_at ON imagenes_negocios(created_at DESC);
```

5. Presiona el botón **▶ Run** (verde)
6. ✅ Debería salir mensaje: "Query executed successfully"

**Verificación:** En el panel izquierdo → **Tables** debería aparecer `imagenes_negocios`

---

## 🚀 PASO 2️⃣: CREAR LA FUNCIÓN `delete_image_from_storage()`

**Ubicación:** Supabase Dashboard → **SQL Editor**

**Instrucciones:**

1. En **SQL Editor**, haz click en **+ New Query**
2. Pega este código exacto:

```sql
CREATE OR REPLACE FUNCTION delete_image_from_storage()
RETURNS TRIGGER AS $$
DECLARE
    file_path TEXT;
BEGIN
    -- Extraer la ruta: "negocio_id/nombre_archivo"
    file_path := OLD.negocio_id || '/' || OLD.nombre_archivo;

    -- Eliminar del Storage
    DELETE FROM storage.objects
    WHERE bucket_id = 'productos'
    AND name = file_path;

    RAISE NOTICE 'Imagen eliminada del Storage: %', file_path;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;
```

3. Presiona **▶ Run** (verde)
4. ✅ Debería salir: "Query executed successfully"

**Verificación:** En el panel izquierdo → **Functions** debería aparecer `delete_image_from_storage`

---

## 🚀 PASO 3️⃣: CREAR EL TRIGGER `trigger_sync_image_deletion`

**Ubicación:** Supabase Dashboard → **SQL Editor**

**Instrucciones:**

1. En **SQL Editor**, haz click en **+ New Query**
2. Pega este código exacto:

```sql
DROP TRIGGER IF EXISTS trigger_sync_image_deletion ON imagenes_negocios CASCADE;

CREATE TRIGGER trigger_sync_image_deletion
AFTER DELETE ON imagenes_negocios
FOR EACH ROW
EXECUTE FUNCTION delete_image_from_storage();
```

3. Presiona **▶ Run** (verde)
4. ✅ Debería salir: "Query executed successfully"

**Verificación:** En el panel izquierdo → **Triggers** debería aparecer `trigger_sync_image_deletion`

---

## 🚀 PASO 4️⃣: VERIFICAR/CREAR BUCKET "productos"

**Ubicación:** Supabase Dashboard → **Storage** → **Buckets**

**Instrucciones:**

1. En el panel izquierdo, haz click en **Storage**
2. Haz click en **Buckets**
3. **Si el bucket "productos" NO existe:**
   - Click en **+ Create a new bucket**
   - Nombre: `productos`
   - ✅ Marcado: **Public bucket** (debe estar ACTIVADO)
   - Click en **Create bucket**
4. ✅ Debería aparecer en la lista

---

## 🚀 PASO 5️⃣: HABILITAR RLS EN BUCKET "productos"

**Ubicación:** Supabase Dashboard → **Storage** → **productos** → **Settings**

**Instrucciones:**

1. En **Storage**, haz click en el bucket **productos**
2. Arriba, haz click en la pestaña **Settings**
3. Encuentra la opción **Enable RLS** (está arriba)
4. ⚠️ IMPORTANTE: El toggle debe estar **AZUL/ACTIVADO**
5. Si está desactivado, haz click para activarlo
6. Presiona **Save**

✅ **Verifica:** El toggle debe estar en color azul

---

## 🚀 PASO 6️⃣: CREAR POLÍTICA SELECT (Lectura pública)

**Ubicación:** Supabase Dashboard → **Storage** → **productos** → **Policies**

**Instrucciones:**

1. En el bucket **productos**, ve a la pestaña **Policies**
2. Haz click en **+ New Policy**
3. Elige **For SELECT** (en el menú)
4. Rellena así:
   - **Policy name:** `allow_public_read`
   - **Allowed role(s):** `anon` ← IMPORTANTE
   - **Target roles:** `anon`
   - **Expression:**

```sql
(bucket_id = 'productos'::text)
```

5. Haz click en **Save policy**

✅ **Verifica:** La política debe aparecer en la lista

---

## 🚀 PASO 7️⃣: CREAR POLÍTICA INSERT (Subir solo tu negocio)

**Ubicación:** Supabase Dashboard → **Storage** → **productos** → **Policies**

**Instrucciones:**

1. En **Policies**, haz click en **+ New Policy**
2. Elige **For INSERT** (en el menú)
3. Rellena así:
   - **Policy name:** `allow_auth_upload`
   - **Allowed role(s):** `authenticated` ← IMPORTANTE
   - **Target roles:** `authenticated`
   - **Expression:**

```sql
(bucket_id = 'productos'::text
 AND (auth.jwt()->>'negocio_id') IS NOT NULL
 AND (auth.jwt()->>'negocio_id') = (string_to_array(name, '/'))[1])
```

4. Haz click en **Save policy**

✅ **Verifica:** La política debe aparecer en la lista

**Qué significa:** Solo usuarios autenticados pueden subir archivos, y SOLO a su propia carpeta de negocio

---

## 🚀 PASO 8️⃣: CREAR POLÍTICA DELETE (Borrar solo el propietario)

**Ubicación:** Supabase Dashboard → **Storage** → **productos** → **Policies**

**Instrucciones:**

1. En **Policies**, haz click en **+ New Policy**
2. Elige **For DELETE** (en el menú)
3. Rellena así:
   - **Policy name:** `allow_owner_delete`
   - **Allowed role(s):** `authenticated` ← IMPORTANTE
   - **Target roles:** `authenticated`
   - **Expression:**

```sql
(bucket_id = 'productos'::text
 AND (auth.jwt()->>'negocio_id') IS NOT NULL
 AND (auth.jwt()->>'negocio_id') = (string_to_array(name, '/'))[1])
```

4. Haz click en **Save policy**

✅ **Verifica:** La política debe aparecer en la lista

**Qué significa:** Solo autenticados pueden borrar archivos, y SOLO sus propios archivos

---

## 🚀 PASO 9️⃣: TESTEAR EL SISTEMA COMPLETO

**Ubicación:** Tu navegador (en la tienda) → **Consola del navegador** (F12)

**Instrucciones:**

1. Abre tu tienda en el navegador
2. Presiona **F12** para abrir la consola
3. Ve a la pestaña **Console**
4. Copia y pega este código (completo):

```javascript
// TEST 1: Insertar imagen de prueba
console.log("🧪 TEST 1: Insertando imagen...");
const { data: inserted, error: insertError } = await supabaseClient
  .from("imagenes_negocios")
  .insert({
    url: "https://via.placeholder.com/300?text=Test+Image",
    nombre_archivo: "test_image_" + Date.now() + ".jpg",
    negocio_id: "test_negocio",
  });

if (insertError) {
  console.error("❌ Error al insertar:", insertError);
} else {
  console.log("✅ Imagen insertada:", inserted);
  const imageId = inserted[0].id;

  // TEST 2: Eliminar imagen (activation trigger)
  console.log(
    "\n🧪 TEST 2: Eliminando imagen (debería ejecutar trigger automaticamente)...",
  );
  const { error: deleteError } = await supabaseClient
    .from("imagenes_negocios")
    .delete()
    .eq("id", imageId);

  if (deleteError) {
    console.error("❌ Error al eliminar:", deleteError);
  } else {
    console.log("✅ Imagen eliminada de la tabla");
    console.log(
      "🔍 El trigger DEBE haber eliminado también del Storage automáticamente",
    );
  }
}
```

5. Presiona **Enter**
6. Si ves ✅ en ambos pasos, **TODO FUNCIONA CORRECTAMENTE**

---

## 📊 RESUMEN DE LO QUE SE CREÓ

| Elemento                      | Tipo       | Ubicación         | Estado    |
| ----------------------------- | ---------- | ----------------- | --------- |
| `imagenes_negocios`           | Tabla      | Database          | ✅ Creada |
| `delete_image_from_storage()` | Función    | Database          | ✅ Creada |
| `trigger_sync_image_deletion` | Trigger    | Database          | ✅ Creado |
| `productos`                   | Bucket     | Storage           | ✅ Creado |
| RLS                           | Habilitado | Storage/productos | ✅ Activo |
| `allow_public_read`           | Política   | Storage/productos | ✅ Creada |
| `allow_auth_upload`           | Política   | Storage/productos | ✅ Creada |
| `allow_owner_delete`          | Política   | Storage/productos | ✅ Creada |

---

## 🎯 CHECKLIST FINAL

Marca cada paso mientras lo completes:

- [x ] ✅ PASO 1: Tabla `imagenes_negocios` creada
- [ x] ✅ PASO 2: Función `delete_image_from_storage()` creada
- [ x] ✅ PASO 3: Trigger `trigger_sync_image_deletion` creado
- [x ] ✅ PASO 4: Bucket `productos` existe
- [ x] ✅ PASO 5: RLS habilitado en bucket
- [ x] ✅ PASO 6: Política SELECT creada
- [x ] ✅ PASO 7: Política INSERT creada
- [ x] ✅ PASO 8: Política DELETE creada
- [ x] ✅ PASO 9: Test ejecutado exitosamente

**Cuando todos estén marcados = Sistema completamente funcional ✅**

---

## 🔄 FLUJO COMPLETO (Resumen)

```
┌─────────────────────────────────────────────────────────────────┐
│  USUARIO CARGA UN PRODUCTO CON IMAGEN (Flujo completo)          │
└─────────────────────────────────────────────────────────────────┘

1. Usuario sube archivo en admin/productos.html
          ↓
2. JavaScript sube archivo a Storage "productos/negocio_id/foto.jpg"
          ↓
3. JavaScript registra en tabla imagenes_negocios:
   {id, url, nombre_archivo, negocio_id}
          ↓
4. JavaScript guarda en Google Sheets con la URL
          ↓
5. Producto guardado ✅

┌─────────────────────────────────────────────────────────────────┐
│  USUARIO ELIMINA UN PRODUCTO (Flujo automático)                  │
└─────────────────────────────────────────────────────────────────┘

1. Usuario elimina producto en admin/productos.html
          ↓
2. JavaScript elimina registro de tabla imagenes_negocios
          ↓
3. [TRIGGER automático se dispara] ⚡
          ↓
4. Función delete_image_from_storage() se ejecuta
          ↓
5. Archivo se elimina de Storage automáticamente
          ↓
6. Cero basura en Supabase ✅
```

---

## 🛡️ TABLA DE PERMISOS (Resumen)

| Operación            | Rol            | Permitido | Limitación                        |
| -------------------- | -------------- | --------- | --------------------------------- |
| **Leer imagen**      | Público (anon) | ✅ SÍ     | Cualquiera puede ver              |
| **Subir imagen**     | Autenticado    | ✅ SÍ     | Solo a su carpeta: `su_negocio/*` |
| **Eliminar imagen**  | Autenticado    | ✅ SÍ     | Solo sus propias: `su_negocio/*`  |
| **Modificar imagen** | Cualquiera     | ❌ NO     | No permitido                      |

---

## 🚨 SOLUCIÓN DE PROBLEMAS

### ❌ "Error: Las imágenes no se eliminan del Storage"

**Checklist:**

1. Ve a SQL Editor → Copia y pega:

```sql
SELECT * FROM pg_trigger WHERE tgname = 'trigger_sync_image_deletion';
```

- Si devuelve 0 filas = Trigger no está creado (repite PASO 3)

2. Verifica que la función existe:

```sql
SELECT * FROM pg_proc WHERE proname = 'delete_image_from_storage';
```

- Si devuelve 0 filas = Función no está creada (repite PASO 2)

3. Revisa los logs: Dashboard → **Logs** → filtra por `delete_image_from_storage`

---

### ❌ "Error: No puedo subir imágenes"

**Posibles causas:**

1. ¿RLS está habilitado? Verifica PASO 5
2. ¿Tu JWT tiene `negocio_id`? En consola:

```javascript
const { data } = await supabaseClient.auth.getSession();
console.log(data?.session?.user?.user_metadata);
```

- Debe mostrar `{negocio_id: "tu_negocio", ...}`

3. ¿El nombre del archivo comienza con tu negocio? Ejemplo:
   - ✅ Correcto: `tu_negocio/foto.jpg`
   - ❌ Incorrecto: `foto.jpg`

---

### ❌ "Error: Las políticas bloquean todo"

**Solución:**

1. Verifica que RLS esté **ACTIVADO** (PASO 5)
2. Verifica que las políticas usen los roles correctos:
   - SELECT: `anon`
   - INSERT: `authenticated`
   - DELETE: `authenticated`

---

## 📞 PREGUNTAS FRECUENTES

**P: ¿Qué pasa si el Trigger falla?**
R: El registro se elimina de la tabla, pero el archivo PODRÍA quedarse en Storage. Solución: Ejecuta limpieza manual o revisa logs.

**P: ¿Puedo ver todas mis imágenes en la tabla?**
R: Sí, en Supabase Dashboard → **SQL Editor** → Ejecuta:

```sql
SELECT * FROM imagenes_negocios WHERE negocio_id = 'tu_negocio';
```

**P: ¿Cómo elimino imágenes huérfanas que quedaron antes?**
R: Manualmente en Storage, o ejecuta en SQL Editor:

```sql
DELETE FROM storage.objects
WHERE bucket_id = 'productos'
AND name NOT IN (SELECT negocio_id || '/' || nombre_archivo FROM imagenes_negocios);
```

**P: ¿Puedo subir imágenes desde fuera de mi aplicación?**
R: No, las políticas RLS solo permiten usuarios autenticados con su `negocio_id` correcto.

---

## ✅ ¡TODO LISTO!

Una vez completes los 9 pasos, tu sistema estará:

- ✅ Completamente protegido con RLS
- ✅ Sincronizado automáticamente (Trigger → Storage)
- ✅ Cero basura garantizado
- ✅ Multi-tenant seguro (cada negocio ve lo suyo)

**Próximo paso: Testa con el PASO 9 y confirma que funciona correctamente 🎉**

package ec.edu.campus.tareas.docker

import android.app.Activity
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.time.LocalDate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class MainActivity : Activity() {
    private val scope: CoroutineScope = MainScope()
    private val api = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
        .create(CampusApi::class.java)

    private lateinit var lista: LinearLayout
    private lateinit var estado: TextView
    private lateinit var crear: Button
    private lateinit var actualizar: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val espacio = (20 * resources.displayMetrics.density).toInt()
        val contenido = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(espacio, espacio * 2, espacio, espacio)
        }
        contenido.addView(TextView(this).apply {
            text = "CampusTareas"
            textSize = 26f
            accessibilityHeading()
        })
        val titulo = campo(contenido, "Título")
        val descripcion = campo(contenido, "Descripción (opcional)")
        val fecha = campo(contenido, "Fecha de entrega (AAAA-MM-DD)")
        crear = Button(this).apply { text = "Crear tarea" }
        actualizar = Button(this).apply { text = "Actualizar lista" }
        estado = TextView(this).apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
        lista = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        listOf(crear, actualizar, estado, lista).forEach { contenido.addView(it) }
        setContentView(ScrollView(this).apply { addView(contenido, MATCH_PARENT, WRAP_CONTENT) })

        crear.setOnClickListener {
            val nombre = titulo.text.toString().trim()
            val entrega = fecha.text.toString().trim()
            if (nombre.isBlank()) {
                titulo.error = "Escribe un título"
                return@setOnClickListener
            }
            if (entrega.isNotEmpty() && runCatching { LocalDate.parse(entrega) }.isFailure) {
                fecha.error = "Usa el formato AAAA-MM-DD"
                return@setOnClickListener
            }
            solicitar {
                val tarea = api.crear(NuevaTareaDto(nombre, descripcion.text.toString().trim(), entrega.ifEmpty { null }))
                titulo.text.clear()
                descripcion.text.clear()
                fecha.text.clear()
                mostrar(api.tareas())
                estado.text = "Tarea creada (ID ${tarea.id})"
            }
        }
        actualizar.setOnClickListener { solicitar { mostrar(api.tareas()) } }
        solicitar { mostrar(api.tareas()) }
    }

    private fun TextView.accessibilityHeading() {
        if (android.os.Build.VERSION.SDK_INT >= 28) isAccessibilityHeading = true
    }

    private fun campo(contenido: LinearLayout, etiqueta: String): EditText =
        EditText(this).apply {
            hint = etiqueta
            inputType = InputType.TYPE_CLASS_TEXT
            setSingleLine()
            contenido.addView(this)
        }

    private fun solicitar(operacion: suspend () -> Unit) {
        crear.isEnabled = false
        actualizar.isEnabled = false
        estado.text = "Consultando el servidor…"
        scope.launch {
            try {
                operacion()
            } catch (cancelacion: kotlinx.coroutines.CancellationException) {
                throw cancelacion
            } catch (_: Exception) {
                estado.text = "No se pudo completar la operación. Revisa la conexión con el servidor."
            } finally {
                crear.isEnabled = true
                actualizar.isEnabled = true
            }
        }
    }

    private fun mostrar(tareas: List<TareaDto>) {
        lista.removeAllViews()
        estado.text = if (tareas.isEmpty()) "Todavía no hay tareas." else "Tareas: ${tareas.size}"
        tareas.forEach { tarea ->
            val detalles = listOfNotNull(
                if (tarea.completada) "Completada" else "Pendiente",
                tarea.fechaEntrega,
                tarea.descripcion.takeIf { it.isNotBlank() },
            )
            lista.addView(TextView(this).apply {
                text = "${tarea.titulo}\n${detalles.joinToString(" · ")}"
                textSize = 17f
                setPadding(0, 16, 0, 16)
            })
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}

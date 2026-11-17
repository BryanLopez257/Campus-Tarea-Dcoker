package ec.edu.campus.tareas.docker

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

data class TareaDto(
    val id: Int,
    val titulo: String,
    val descripcion: String = "",
    val fechaEntrega: String? = null,
    val completada: Boolean = false,
)

data class NuevaTareaDto(
    val titulo: String,
    val descripcion: String = "",
    val fechaEntrega: String? = null,
)

interface CampusApi {
    @GET("tareas")
    suspend fun tareas(): List<TareaDto>

    @POST("tareas")
    suspend fun crear(@Body tarea: NuevaTareaDto): TareaDto
}

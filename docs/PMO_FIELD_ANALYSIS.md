# Análisis de Campos PMO - Propósito de Negocio y Metodología Six Sigma

## Introducción

Este documento analiza cada campo del Excel de gestión de proyectos de mejora continua, explicando:
1. **Por qué la empresa captura esta información** - el valor de negocio
2. **Utilidad para el PMO** - cómo apoya decisiones de portafolio
3. **Conexión con Six Sigma/DMAIC** - en qué fase es relevante
4. **Indicadores derivados** - métricas y visualizaciones posibles

---

## 1. IDENTIFICACIÓN DEL PROYECTO

### 1.1 ID Legacy / Card ID DevOps / ID Power Steering
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Trazabilidad hacia sistemas heredados (Power Steering, Azure DevOps). Permite vincular el proyecto con históricos y reportes anteriores. |
| **Utilidad PMO** | Migración de datos, auditoría, reconciliación entre sistemas. Identificar proyectos duplicados o migrados. |
| **Fase DMAIC** | Pre-proyecto (registro inicial) |
| **Indicadores** | Tasa de migración exitosa, proyectos sin ID legacy (nuevos vs migrados) |

### 1.2 Nombre de Iniciativa / Proyecto
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Identificación única del proyecto. Debe ser descriptivo para que cualquier stakeholder entienda el objetivo. |
| **Utilidad PMO** | Búsqueda, filtrado, reportes ejecutivos. Un buen nombre reduce preguntas de contexto. |
| **Fase DMAIC** | Define (D) - se establece al definir el proyecto |
| **Indicadores** | Proyectos con nombres ambiguos (requieren revisión de nomenclatura) |

### 1.3 Descripción
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Contexto detallado del problema a resolver y la solución propuesta. |
| **Utilidad PMO** | Evaluación de alcance, identificación de duplicados o sinergias entre proyectos. |
| **Fase DMAIC** | Define (D) - documenta el problema |
| **Indicadores** | Proyectos sin descripción (riesgo de desalineación) |

---

## 2. GOBIERNO Y ROLES

### 2.1 Líder / Solicitante
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Persona que ejecuta el proyecto y es responsable de su avance diario. Punto de contacto operativo. |
| **Utilidad PMO** | Distribución de carga de trabajo por líder. Identificar líderes sobrecargados o con proyectos estancados. |
| **Fase DMAIC** | Define (D) - se asigna al inicio |
| **Indicadores** | Proyectos por líder, tasa de éxito por líder, carga de trabajo |

### 2.2 Dueño del Proceso / Sponsor
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Ejecutivo que patrocina el proyecto, remueve obstáculos y es dueño del proceso a mejorar. Tiene autoridad para tomar decisiones de recursos. |
| **Utilidad PMO** | Escalación de issues, compromiso ejecutivo, priorización de recursos. Sponsors desenganchados = proyectos en riesgo. |
| **Fase DMAIC** | Define (D) - patrocinio desde el inicio |
| **Indicadores** | Proyectos por sponsor, tasa de éxito por sponsor, nivel de compromiso |

### 2.3 Black Belt Lead
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Experto certificado en Six Sigma que lidera la metodología. Garantiza rigor estadístico y metodológico. |
| **Utilidad PMO** | Asegurar que proyectos críticos tienen expertise adecuado. Balancear carga entre Black Belts. |
| **Fase DMAIC** | Todas las fases - guía metodológica continua |
| **Indicadores** | Proyectos por Black Belt, tiempo promedio de ciclo por BB, calidad de entregables |

### 2.4 DTC Lead (Digital Transformation Champion)
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Líder de transformación digital que asegura que las soluciones aprovechan tecnología y digitalización. |
| **Utilidad PMO** | Identificar proyectos con componente digital, coordinar con áreas de TI, evitar duplicidad de soluciones. |
| **Fase DMAIC** | Improve (I) - diseño de solución |
| **Indicadores** | Proyectos con componente digital, adopción de tecnología |

### 2.5 Business Process Analyst
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Analista que documenta procesos AS-IS y TO-BE. Asegura que cambios están documentados y son repetibles. |
| **Utilidad PMO** | Calidad de documentación, transferencia de conocimiento, estandarización de procesos. |
| **Fase DMAIC** | Measure (M) y Analyze (A) - mapeo de procesos |
| **Indicadores** | Proyectos con documentación completa, procesos estandarizados |

---

## 3. CLASIFICACIÓN Y CONTEXTO

### 3.1 Departamento / Proceso de Negocio / Área
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Área funcional que se beneficia del proyecto. Permite agrupar por unidad de negocio. |
| **Utilidad PMO** | Balancear inversión en mejora entre departamentos. Identificar áreas sub-atendidas o sobre-cargadas. |
| **Fase DMAIC** | Define (D) - contexto organizacional |
| **Indicadores** | Distribución de proyectos por departamento, ROI por área, backlog por departamento |

### 3.2 Tipo de Iniciativa
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Clasificación del tipo de mejora: Terminado, On going, Proyecto nuevo, Duplicado/Cancelado. |
| **Utilidad PMO** | Filtrar portafolio activo, entender pipeline de nuevos proyectos, limpiar proyectos cancelados. |
| **Fase DMAIC** | Control (C) - estado final del proyecto |
| **Indicadores** | Distribución por tipo, tasa de cancelación, velocidad de cierre |

### 3.3 Área de Productividad
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Categoría de mejora: productividad, calidad, costo, velocidad, experiencia cliente. |
| **Utilidad PMO** | Balancear portafolio entre diferentes objetivos estratégicos. Alinear con OKRs corporativos. |
| **Fase DMAIC** | Define (D) - objetivo del proyecto |
| **Indicadores** | Distribución por área de productividad, impacto por categoría |

### 3.4 Alcance Geográfico (Nacional/Local/NLATAM)
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Cobertura territorial del proyecto: local (una sucursal), nacional (país), NLATAM (región). |
| **Utilidad PMO** | Priorizar proyectos de mayor impacto geográfico. Coordinar roll-outs multi-país. |
| **Fase DMAIC** | Define (D) - alcance del proyecto |
| **Indicadores** | Distribución por alcance, beneficios ponderados por cobertura |

---

## 4. FECHAS Y CICLO DE VIDA

### 4.1 Fecha de Inicio
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Marca el inicio oficial del proyecto. Base para calcular duración y tiempo de ciclo. |
| **Utilidad PMO** | Calcular aging de proyectos, identificar proyectos de larga duración, planificar capacidad. |
| **Fase DMAIC** | Define (D) - kick-off |
| **Indicadores** | Tiempo de ciclo, proyectos > 6 meses, aging promedio |

### 4.2 Fecha de Término Estimada
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Compromiso de entrega. Permite planificar beneficios esperados y coordinar dependencias. |
| **Utilidad PMO** | Identificar proyectos vencidos, calcular desviación vs plan, alertas de fechas próximas. |
| **Fase DMAIC** | Define (D) - compromiso inicial; Control (C) - ajustes |
| **Indicadores** | Proyectos vencidos, desviación de fechas, precisión de estimaciones |

### 4.3 Fecha de Término Real
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Fecha en que realmente cerró el proyecto. Permite calcular precisión de estimaciones. |
| **Utilidad PMO** | Medir desviación estimado vs real, mejorar capacidad de estimación futura. |
| **Fase DMAIC** | Control (C) - cierre |
| **Indicadores** | Desviación promedio, proyectos cerrados a tiempo, lead time real |

### 4.4 Tiempo de Ciclo en Días
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Duración total del proyecto desde inicio hasta cierre. Métrica fundamental de eficiencia PMO. |
| **Utilidad PMO** | Benchmark de proyectos, identificar cuellos de botella, optimizar procesos PMO. |
| **Fase DMAIC** | Control (C) - medición de eficiencia |
| **Indicadores** | Tiempo de ciclo promedio, distribución, tendencia temporal |

---

## 5. ESTADO Y AVANCE

### 5.1 Estatus al Día (Traffic Light)
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Indicador visual del estado de riesgo del proyecto: On time (verde), Stand by (amarillo), En riesgo (rojo), No iniciado (gris). |
| **Utilidad PMO** | Identificación rápida de proyectos problemáticos. Dashboard ejecutivo de salud del portafolio. |
| **Fase DMAIC** | Todas las fases - monitoreo continuo |
| **Indicadores** | Distribución de semáforos, tendencia de rojos, tiempo en rojo |

### 5.2 Fase DMAIC
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Define, Measure, Analyze, Improve, Control - ubicación metodológica del proyecto. |
| **Utilidad PMO** | Distribución de proyectos por fase, identificar cuellos de botella metodológicos, balancear pipeline. |
| **Fase DMAIC** | Es la fase actual del proyecto |
| **Indicadores** | Proyectos por fase, tiempo promedio por fase, transiciones |

### 5.3 % Avance
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Porcentaje de completitud del proyecto. Permite estimar esfuerzo restante. |
| **Utilidad PMO** | Identificar proyectos estancados (bajo avance por mucho tiempo), planificar cierre. |
| **Fase DMAIC** | Todas las fases - progreso continuo |
| **Indicadores** | Avance promedio, correlación avance vs tiempo, proyectos estancados |

### 5.4 S/N (Status / Next Steps)
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Actualización narrativa del estado actual (S:) y próximos pasos (N:). Comunicación ejecutiva. |
| **Utilidad PMO** | Entender contexto cualitativo, identificar bloqueos, preparar reportes ejecutivos. |
| **Fase DMAIC** | Todas las fases - comunicación continua |
| **Indicadores** | Frecuencia de actualización, proyectos sin update reciente |

### 5.5 Acciones a Ejecutar
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Tareas específicas pendientes para avanzar el proyecto. Foco operativo. |
| **Utilidad PMO** | Seguimiento granular, identificar bloqueos específicos, accountability. |
| **Fase DMAIC** | Improve (I) y Control (C) - ejecución |
| **Indicadores** | Acciones vencidas, acciones completadas, velocity |

---

## 6. IMPACTO FINANCIERO Y BENEFICIOS

### 6.1 Business Impact USD
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Valor económico esperado del proyecto en dólares. Justificación financiera de la inversión. |
| **Utilidad PMO** | Priorización por ROI, reporte de valor entregado, justificación de recursos PMO. |
| **Fase DMAIC** | Define (D) - business case; Control (C) - validación |
| **Indicadores** | Impacto total del portafolio, impacto por departamento, ROI del PMO |

### 6.2 Beneficios / Valor Diferenciador
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Descripción cualitativa de los beneficios: ahorro, eficiencia, calidad, satisfacción cliente. |
| **Utilidad PMO** | Comunicar valor a stakeholders, alinear con estrategia, categorizar beneficios. |
| **Fase DMAIC** | Define (D) - propuesta de valor |
| **Indicadores** | Tipos de beneficios más comunes, proyectos por categoría de beneficio |

### 6.3 Soft Savings
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Beneficios no monetarios directos: tiempo liberado, reducción de errores, satisfacción. |
| **Utilidad PMO** | Valoración integral del portafolio, no solo financiera. Justificar proyectos de calidad/experiencia. |
| **Fase DMAIC** | Define (D) - beneficios intangibles |
| **Indicadores** | Proporción soft vs hard savings, proyectos de productividad |

---

## 7. SISTEMA DE PRIORIZACIÓN (SCORING)

### 7.1 Dimensiones de Valor

#### Nivel de Sponsor
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | VP (5), Director (4), Gerente (3), Supervisor (2), Usuario (1). Mayor nivel = mayor importancia estratégica. |
| **Utilidad PMO** | Proyectos con sponsors de alto nivel tienen más visibilidad y recursos. Indicador de compromiso ejecutivo. |
| **Fase DMAIC** | Define (D) - patrocinio |
| **Indicadores** | Distribución por nivel, correlación nivel vs éxito |

#### Impacto Financiero
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Alto >300 KUSD (5), Medio (3), Bajo (1), Ninguno (0). Prioriza proyectos de alto valor económico. |
| **Utilidad PMO** | Focalizar recursos en proyectos de mayor impacto. Justificar inversión PMO. |
| **Fase DMAIC** | Define (D) - business case |
| **Indicadores** | Distribución por impacto, valor total del portafolio |

#### Alcance Geográfico
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | NLATAM (5), Nacional (3), Local (1), No (0). Mayor alcance = mayor valor organizacional. |
| **Utilidad PMO** | Priorizar mejoras de amplio impacto sobre optimizaciones locales. |
| **Fase DMAIC** | Define (D) - alcance |
| **Indicadores** | Distribución por alcance, beneficios ponderados |

#### Transformación
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Transformación (5), Mejora completa (3), Mejora parcial (1), Ninguno (0). Distingue proyectos transformacionales vs incrementales. |
| **Utilidad PMO** | Balancear portafolio entre cambios disruptivos y mejoras continuas. |
| **Fase DMAIC** | Define (D) - tipo de cambio |
| **Indicadores** | Proporción transformación vs mejora, pipeline estratégico |

#### Volumen de Usuarios
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | >500 (5), 300-500 (4), 200-300 (3), 100-200 (2), <100 (1). Más usuarios = mayor impacto. |
| **Utilidad PMO** | Priorizar mejoras que benefician a más personas. |
| **Fase DMAIC** | Define (D) - stakeholders |
| **Indicadores** | Distribución por volumen, impacto por usuario |

### 7.2 Dimensiones de Esfuerzo (Invertido: mayor = menos esfuerzo real)

#### Tamaño del Proyecto
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Cambio Menor ≤40hrs (5), Mayor (4), Proyecto Menor (3), Mediano (2), Mayor (1). Proyectos pequeños = fáciles de ejecutar. |
| **Utilidad PMO** | Identificar "quick wins" vs proyectos que requieren planificación extensa. |
| **Fase DMAIC** | Define (D) - estimación de esfuerzo |
| **Indicadores** | Distribución por tamaño, tiempo de ciclo por tamaño |

#### Dependencias
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Ninguna (5), 1 (4), 2-5 (3), >5 (1). Menos dependencias = menor riesgo de bloqueo. |
| **Utilidad PMO** | Identificar proyectos de alto riesgo por dependencias. Gestionar interdependencias. |
| **Fase DMAIC** | Define (D) y Improve (I) - riesgos |
| **Indicadores** | Proyectos con muchas dependencias, bloqueos por dependencias |

#### Inversión Requerida
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | No (5), <5 KUSD (4), 5-20 KUSD (3), 20-100 KUSD (2), >100 KUSD (1). Menor inversión = menor barrera. |
| **Utilidad PMO** | Identificar proyectos que requieren CAPEX, planificar presupuesto. |
| **Fase DMAIC** | Define (D) - recursos |
| **Indicadores** | Inversión total del portafolio, distribución por rango |

#### Tiempo de Implementación
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | <1 mes (5), 1-3 meses (3), >3 meses (1). Menor tiempo = resultados más rápidos. |
| **Utilidad PMO** | Balancear quick wins con proyectos de largo plazo. Planificar capacidad. |
| **Fase DMAIC** | Define (D) - timeline |
| **Indicadores** | Distribución por duración, precisión de estimaciones |

### 7.3 Puntajes Calculados

#### Total Valor
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Suma de las 5 dimensiones de valor. Indica qué tan valioso es el proyecto para la organización. |
| **Utilidad PMO** | Comparar proyectos por valor, priorizar recursos hacia alto valor. |
| **Fase DMAIC** | Define (D) - priorización |
| **Indicadores** | Ranking por valor, distribución, correlación con éxito |

#### Total Esfuerzo
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Suma de las 4 dimensiones de esfuerzo (INVERTIDO: mayor = MENOS esfuerzo real). Indica facilidad de ejecución. |
| **Utilidad PMO** | Identificar proyectos fáciles vs difíciles. Balancear carga de trabajo. |
| **Fase DMAIC** | Define (D) - factibilidad |
| **Indicadores** | Ranking por esfuerzo, correlación con tiempo de ciclo |

#### Puntaje Total
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Total Valor + Total Esfuerzo. Ranking general de priorización. |
| **Utilidad PMO** | Ordenar backlog de proyectos, decidir qué ejecutar primero. |
| **Fase DMAIC** | Define (D) - priorización final |
| **Indicadores** | Top 10 proyectos, distribución de puntajes |

#### Ranking
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Posición ordinal por Puntaje Total. Facilita comunicación ("proyecto #1"). |
| **Utilidad PMO** | Comunicar prioridades a stakeholders, asignar recursos. |
| **Fase DMAIC** | Define (D) - priorización comunicada |
| **Indicadores** | Estabilidad del ranking, cambios semana a semana |

---

## 8. DEPENDENCIAS TÉCNICAS

### 8.1 IT Local
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Indica si el proyecto requiere soporte del área de TI local. |
| **Utilidad PMO** | Planificar capacidad de TI, coordinar recursos técnicos, identificar cuellos de botella. |
| **Fase DMAIC** | Improve (I) - implementación |
| **Indicadores** | Proyectos bloqueados por TI, carga de TI |

### 8.2 T. Digital (Transformación Digital)
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Indica dependencia del equipo de transformación digital corporativo. |
| **Utilidad PMO** | Coordinar con agenda digital, evitar duplicidad de soluciones. |
| **Fase DMAIC** | Improve (I) - solución tecnológica |
| **Indicadores** | Proyectos con componente digital, adopción tecnológica |

### 8.3 Digitalización
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Marca si el proyecto implica digitalizar un proceso manual. |
| **Utilidad PMO** | Medir progreso de digitalización organizacional, priorizar automatización. |
| **Fase DMAIC** | Improve (I) - automatización |
| **Indicadores** | Índice de digitalización, procesos automatizados |

### 8.4 SSC (Shared Services Center)
| Aspecto | Descripción |
|---------|-------------|
| **Por qué se captura** | Indica dependencia del Centro de Servicios Compartidos para implementación. |
| **Utilidad PMO** | Coordinar con SSC, planificar capacidad de servicios compartidos. |
| **Fase DMAIC** | Improve (I) y Control (C) - operación |
| **Indicadores** | Proyectos que tocan SSC, carga del centro de servicios |

---

## 9. CONEXIÓN CON METODOLOGÍA DMAIC

| Fase | Campos Clave | Propósito |
|------|-------------|-----------|
| **Define (D)** | Nombre, Descripción, Sponsor, Líder, Departamento, Fecha Inicio, Business Impact, Scoring | Establecer el proyecto, justificar inversión, asignar recursos |
| **Measure (M)** | % Avance, Business Process Analyst, S/N | Medir estado actual, establecer baseline |
| **Analyze (A)** | S/N, Riesgos, Dependencias | Identificar causas raíz, analizar datos |
| **Improve (I)** | DTC Lead, IT Local, T. Digital, Acciones | Diseñar e implementar soluciones |
| **Control (C)** | Fecha Término, Estatus al Día, Beneficios, Fase | Sostener mejoras, cerrar proyecto |

---

## 10. RECOMENDACIONES PARA EL PMO

### Campos Críticos (Obligatorios)
- Nombre de Iniciativa
- Líder
- Sponsor
- Departamento
- Fecha Inicio
- Fecha Término Estimada
- Estatus al Día
- Business Impact USD

### Campos de Valor Agregado (Recomendados)
- Black Belt Lead
- Scoring completo (9 dimensiones)
- S/N actualizado semanalmente
- Dependencias técnicas

### Indicadores Clave para Dashboard Ejecutivo
1. **Salud del Portafolio**: % proyectos en verde/amarillo/rojo
2. **Valor Entregado**: Business Impact USD de proyectos cerrados
3. **Velocidad**: Tiempo de ciclo promedio
4. **Capacidad**: Proyectos por líder/Black Belt
5. **Priorización**: Distribución en Matriz Valor/Esfuerzo (Quick Wins vs Money Pit)

---

## 11. GLOSARIO SIX SIGMA

| Término | Definición |
|---------|------------|
| **DMAIC** | Define, Measure, Analyze, Improve, Control - metodología de mejora de procesos |
| **Black Belt** | Profesional certificado que lidera proyectos Six Sigma |
| **Green Belt** | Profesional con conocimiento intermedio de Six Sigma |
| **Sponsor** | Ejecutivo que patrocina y remueve obstáculos del proyecto |
| **CTQ** | Critical To Quality - características críticas para el cliente |
| **VOC** | Voice Of Customer - necesidades y expectativas del cliente |
| **Kaizen** | Mejora continua incremental |
| **Quick Win** | Proyecto de alto valor y bajo esfuerzo - ejecutar primero |
| **Big Bet** | Proyecto de alto valor y alto esfuerzo - planificar cuidadosamente |

---

*Documento generado para uso del PMO y como base de conocimiento para sistemas RAG.*
*Última actualización: Diciembre 2025*

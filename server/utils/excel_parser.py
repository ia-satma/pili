#!/usr/bin/env python3
"""
Excel Parser with Anchor Row Detection and DETERMINISTIC Column Mapping.
Uses EXACT 1:1 mappings for all Excel columns - NO fuzzy matching.
"""

import sys
import json
import pandas as pd
import re
from datetime import datetime
from typing import Optional, Dict, List, Any


# =============================================================================
# EXACT COLUMN MAPPINGS - DETERMINISTIC 1:1
# =============================================================================

EXACT_COLUMN_MAPPINGS = {
    # Row 1 headers
    'previo': 'previo',
    'ranking': 'ranking',
    'id power steering': 'legacyId',
    'card id devops': 'cardIdDevops',
    'iniciativa': 'projectName',
    'descripción': 'problemStatement',
    'descripcion': 'problemStatement',
    'valor / diferenciador': 'valorDiferenciador',
    'valor/ diferenciador': 'valorDiferenciador',
    
    # Row 2 headers
    'fecha de registro': 'registrationDate',
    'fecha inicio': 'startDate',
    'fecha de término / real o estimada': 'endDateEstimated',
    'fecha de termino / real o estimada': 'endDateEstimated',
    'fecha de término': 'endDateEstimated',
    'fecha de termino': 'endDateEstimated',
    't. de ciclo en días': 'tiempoCicloDias',
    't. de ciclo en dias': 'tiempoCicloDias',
    'estatus al día': 'estatusAlDia',
    'estatus al dia': 'estatusAlDia',
    'proceso de negocio': 'departmentName',
    'ingresada en pbot': 'ingresadaEnPbot',
    'grupo técnico asignado': 'grupoTecnicoAsignado',
    'grupo tecnico asignado': 'grupoTecnicoAsignado',
    'tipo de iniciativa': 'status',
    'citizen developer / creator': 'citizenDeveloper',
    'citizen developer': 'citizenDeveloper',
    'dueño del proceso': 'sponsor',
    'dueno del proceso': 'sponsor',
    'líder o solicitante': 'leader',
    'lider o solicitante': 'leader',
    
    # Row 3 headers
    'dtc lead': 'dtcLead',
    'black belt lead': 'blackBeltLead',
    'dirección de negocio del usuario': 'direccionNegocioUsuario',
    'direccion de negocio del usuario': 'direccionNegocioUsuario',
    '¿impacta a gases envasados ?': 'impactaGasesEnvasados',
    '¿impacta a gases envasados?': 'impactaGasesEnvasados',
    'impacta a gases envasados': 'impactaGasesEnvasados',
    'business process analyst': 'bpAnalyst',
    'área de productividad': 'areaProductividad',
    'area de productividad': 'areaProductividad',
    
    # Dependencies
    'dependencia it local': 'dependenciasItLocal',
    'dependencia t digital': 'dependenciasTDigital',
    'dependencia digitalización ssc': 'dependenciasDigitalizacionSsc',
    'dependencia digitalizacion ssc': 'dependenciasDigitalizacionSsc',
    'dependencia externo': 'dependenciasExterno',
    
    # Scoring matrix headers - Real Excel headers (Row 2 questions)
    '¿en que nivel es detonada la necesidad?': 'scoringNivelDemanda',
    '¿en qué nivel es detonada la necesidad?': 'scoringNivelDemanda',
    '¿de qué nivel es demanda la necesidad?': 'scoringNivelDemanda',
    '¿de que nivel es demanda la necesidad?': 'scoringNivelDemanda',
    '¿tiene un sponsor o dueño?': 'scoringTieneSponsor',
    '¿tiene un sponsor o dueno?': 'scoringTieneSponsor',
    '¿a cuántas personas /clientes impacta?': 'scoringPersonasAfecta',
    '¿a cuantas personas /clientes impacta?': 'scoringPersonasAfecta',
    '¿a cuántas personas afecta?': 'scoringPersonasAfecta',
    '¿a cuantas personas afecta?': 'scoringPersonasAfecta',
    'alineado a objetivos / estrategia': 'strategicFit',
    'alineado a objetivos estratég.': 'strategicFit',
    'alineado a objetivos estrateg.': 'strategicFit',
    '¿cuál es el impacto en beneficios duros anuales?': 'financialImpact',
    '¿cual es el impacto en beneficios duros anuales?': 'financialImpact',
    '¿cuál es el impacto en beneficios duros?': 'financialImpact',
    '¿cual es el impacto en beneficios duros?': 'financialImpact',
    '¿simplifica procesos o mejora el control?': 'scoringSimplificaProcesos',
    '¿es replicable?': 'scoringEsReplicable',
    '¿es proyecto estratégico?': 'scoringEsEstrategico',
    '¿es proyecto estrategico?': 'scoringEsEstrategico',
    '¿requiere recursos externos para el desarrollo?': 'scoringRecursosExternos',
    'requiere capex/inversión?': 'capexTier',
    'requiere capex/inversion?': 'capexTier',
    '¿requiere capex/inversion?': 'capexTier',
    '¿requiere capex/inversión?': 'capexTier',
    '¿cuál es el tiempo de desarrollo?': 'scoringTiempoDesarrollo',
    '¿cual es el tiempo de desarrollo?': 'scoringTiempoDesarrollo',
    '¿cuál es el tiempo para implementar la solución?': 'scoringTiempoImplementar',
    '¿cual es el tiempo para implementar la solucion?': 'scoringTiempoImplementar',
    '¿cuál es la calidad de la información?': 'scoringCalidadInformacion',
    '¿cual es la calidad de la informacion?': 'scoringCalidadInformacion',
    '¿cuál es la calidad de datos y disponibilidad de la información?': 'scoringCalidadInformacion',
    '¿cual es la calidad de datos y disponibilidad de la informacion?': 'scoringCalidadInformacion',
    '¿cuál es el tiempo para conseguir la información?': 'scoringTiempoConseguirInfo',
    '¿cual es el tiempo para conseguir la informacion?': 'scoringTiempoConseguirInfo',
    '¿qué tan compleja es la implementación técnica?': 'scoringComplejidadTecnica',
    '¿que tan compleja es la implementacion tecnica?': 'scoringComplejidadTecnica',
    '¿qué tan compleja es la integración técnica de la(s) solucion digital?': 'scoringComplejidadTecnica',
    '¿que tan compleja es la integracion tecnica de la(s) solucion digital?': 'scoringComplejidadTecnica',
    'complejidad del cambio a personas': 'scoringComplejidadCambio',
    
    # Totals and status
    'total esfuerzo': 'totalEsfuerzo',
    'puntaje total': 'puntajeTotal',
    'total valor': 'totalValor',
    'estatus y siguientes pasos': 'statusText',
    'estatus y siguientes pasos (s/n)': 'statusText',
    'fase': 'fase',
    'acciones a ejecutar para acelerar': 'accionesAcelerar',
    'business impact usd$ growth / year estimated': 'businessImpactGrowth',
    'business impact usd$ growth / year': 'businessImpactGrowth',
    'business impact usd$ costos': 'businessImpactCostos',
}

# Numeric fields that should be parsed as numbers
NUMERIC_FIELDS = {
    'ranking', 'totalEsfuerzo', 'puntajeTotal', 'totalValor', 'tiempoCicloDias',
    'previo', 'scoringNivelDemanda', 'scoringTieneSponsor', 'scoringPersonasAfecta',
    'scoringEsReplicable', 'scoringEsEstrategico', 'scoringTiempoDesarrollo',
    'scoringCalidadInformacion', 'scoringTiempoConseguirInfo', 'scoringComplejidadTecnica',
    'scoringComplejidadCambio', 'businessImpactGrowth', 'businessImpactCostos',
    'strategicFit', 'financialImpact', 'capexTier', 'scoringSimplificaProcesos',
    'scoringRecursosExternos', 'scoringTiempoImplementar'
}

# Date fields that should be parsed as dates
DATE_FIELDS = {'registrationDate', 'startDate', 'endDateEstimated'}


# =============================================================================
# HEADER NORMALIZATION
# =============================================================================

def normalize_header(text: Any) -> str:
    """
    Normalize header for matching:
    1. Lowercase
    2. Strip whitespace
    3. Replace multiple spaces with single space
    """
    if pd.isna(text):
        return ""
    normalized = str(text).lower().strip()
    normalized = re.sub(r'\s+', ' ', normalized)
    return normalized


def map_column_name(col_name: str) -> Optional[str]:
    """
    Map Excel column header to database field using EXACT 1:1 mappings only.
    NO fuzzy matching - only exact dictionary lookups.
    """
    normalized = normalize_header(col_name)
    
    if not normalized:
        return None
    
    # ONLY exact dictionary lookup - no substring matching
    if normalized in EXACT_COLUMN_MAPPINGS:
        return EXACT_COLUMN_MAPPINGS[normalized]
    
    return None


# =============================================================================
# ANCHOR ROW DETECTION
# =============================================================================

def find_anchor_row(df: pd.DataFrame, max_rows: int = 15) -> int:
    """
    Find the row containing 'Iniciativa' column header.
    Returns the 0-based row index, or 0 if not found.
    """
    for row_idx in range(min(max_rows, len(df))):
        for col_idx in range(len(df.columns)):
            cell_value = df.iloc[row_idx, col_idx]
            if pd.notna(cell_value):
                normalized = normalize_header(cell_value)
                if normalized == 'iniciativa':
                    return row_idx
    return 0


def build_merged_headers(df: pd.DataFrame, anchor_row: int) -> List[str]:
    """
    Build merged headers from multi-row header structure.
    Combines row before anchor (scoring questions) with anchor row (main headers).
    """
    headers = []
    num_cols = len(df.columns)
    
    for col_idx in range(num_cols):
        # Get anchor row value (primary header)
        anchor_val = df.iloc[anchor_row, col_idx] if anchor_row < len(df) else None
        anchor_str = str(anchor_val).strip() if pd.notna(anchor_val) else ""
        
        # Get row before anchor (scoring questions)
        prev_val = None
        if anchor_row > 0:
            prev_val = df.iloc[anchor_row - 1, col_idx]
        prev_str = str(prev_val).strip() if pd.notna(prev_val) else ""
        
        # Decide which header to use
        if anchor_str and anchor_str.lower() not in ['nan', '']:
            headers.append(anchor_str)
        elif prev_str and prev_str.lower() not in ['nan', '']:
            headers.append(prev_str)
        else:
            headers.append(f"Column_{col_idx}")
    
    return headers


# =============================================================================
# VALUE PARSING
# =============================================================================

def parse_value(value: Any, field_name: str) -> Any:
    """Parse a cell value based on the target field type."""
    if pd.isna(value) or value == "" or str(value).lower() in ['nan', 'none', 'null']:
        return None
    
    str_value = str(value).strip()
    
    # Handle numeric fields
    if field_name in NUMERIC_FIELDS:
        try:
            # Remove currency symbols and commas
            cleaned = re.sub(r'[$,\s]', '', str_value)
            if cleaned == '' or cleaned == '-':
                return None
            # Try integer first
            if '.' not in cleaned:
                return int(float(cleaned))
            return float(cleaned)
        except (ValueError, TypeError):
            return None
    
    # Handle date fields
    if field_name in DATE_FIELDS:
        try:
            # Try common date formats
            for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d']:
                try:
                    dt = datetime.strptime(str_value, fmt)
                    return dt.strftime('%Y-%m-%d')
                except ValueError:
                    continue
            # Try pandas date parsing as fallback
            dt = pd.to_datetime(str_value, errors='coerce')
            if pd.notna(dt):
                return dt.strftime('%Y-%m-%d')
            return None
        except:
            return None
    
    # Handle boolean-like fields
    if field_name in {'dependenciasItLocal', 'dependenciasTDigital', 'dependenciasDigitalizacionSsc', 'dependenciasExterno'}:
        lower_val = str_value.lower()
        if lower_val in ['sí', 'si', 'yes', 'true', '1', 'x']:
            return True
        elif lower_val in ['no', 'false', '0', '']:
            return False
        return None
    
    # Return string for other fields
    return str_value if str_value else None


# =============================================================================
# MAIN PARSER
# =============================================================================

def parse_excel(file_path: str) -> Dict[str, Any]:
    """
    Parse Excel file with anchor row detection and deterministic column mapping.
    """
    try:
        # Read Excel without headers first
        df = pd.read_excel(file_path, header=None, sheet_name=0)
        
        if df.empty:
            return {"success": False, "error": "Excel file is empty", "projects": []}
        
        # Find anchor row (containing 'Iniciativa')
        anchor_row = find_anchor_row(df)
        
        # Build merged headers
        headers = build_merged_headers(df, anchor_row)
        
        # Create column mapping
        column_mapping = {}
        mapped_columns = []
        unmapped_columns = []
        
        for col_idx, header in enumerate(headers):
            db_field = map_column_name(header)
            if db_field:
                column_mapping[col_idx] = db_field
                mapped_columns.append(f"{header} → {db_field}")
            else:
                unmapped_columns.append(header)
        
        # Parse data rows (starting after anchor row)
        data_start = anchor_row + 1
        projects = []
        
        for row_idx in range(data_start, len(df)):
            row = df.iloc[row_idx]
            
            # Skip empty rows
            if row.isna().all():
                continue
            
            project = {}
            has_data = False
            
            for col_idx, db_field in column_mapping.items():
                if col_idx < len(row):
                    value = parse_value(row.iloc[col_idx], db_field)
                    if value is not None:
                        project[db_field] = value
                        has_data = True
            
            # Only add rows that have at least a project name or some data
            if has_data and (project.get('projectName') or project.get('ranking')):
                projects.append(project)
        
        return {
            "success": True,
            "projects": projects,
            "metadata": {
                "total_rows": len(df),
                "data_start_row": data_start,
                "anchor_row": anchor_row,
                "columns_mapped": len(column_mapping),
                "columns_total": len(headers),
                "mapped_columns": mapped_columns[:20],  # First 20 for debugging
                "unmapped_columns": unmapped_columns[:10],  # First 10 unmapped
            }
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "projects": []
        }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"success": False, "error": "Usage: python excel_parser.py <file_path>"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    result = parse_excel(file_path)
    print(json.dumps(result, ensure_ascii=False, default=str))

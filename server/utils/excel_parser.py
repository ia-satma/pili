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
    
    # Row 2 headers
    'fecha de registro': 'registrationDate',
    'fecha inicio': 'startDate',
    'fecha de término / real o estimada': 'endDateEstimated',
    'fecha de termino / real o estimada': 'endDateEstimated',
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
    'business process analyst': 'bpAnalyst',
    'área de productividad': 'areaProductividad',
    'area de productividad': 'areaProductividad',
    
    # Scoring matrix headers
    '¿de qué nivel es demanda la necesidad?': 'scoringNivelDemanda',
    '¿de que nivel es demanda la necesidad?': 'scoringNivelDemanda',
    '¿tiene un sponsor o dueño?': 'scoringTieneSponsor',
    '¿tiene un sponsor o dueno?': 'scoringTieneSponsor',
    '¿a cuántas personas afecta?': 'scoringPersonasAfecta',
    '¿a cuantas personas afecta?': 'scoringPersonasAfecta',
    'alineado a objetivos estratég.': 'strategicFit',
    'alineado a objetivos estrateg.': 'strategicFit',
    '¿cuál es el impacto en beneficios duros?': 'financialImpact',
    '¿cual es el impacto en beneficios duros?': 'financialImpact',
    '¿es replicable?': 'scoringEsReplicable',
    '¿es proyecto estratégico?': 'scoringEsEstrategico',
    '¿es proyecto estrategico?': 'scoringEsEstrategico',
    'requiere capex/inversión?': 'capexTier',
    'requiere capex/inversion?': 'capexTier',
    '¿cuál es el tiempo de desarrollo?': 'scoringTiempoDesarrollo',
    '¿cual es el tiempo de desarrollo?': 'scoringTiempoDesarrollo',
    '¿cuál es la calidad de la información?': 'scoringCalidadInformacion',
    '¿cual es la calidad de la informacion?': 'scoringCalidadInformacion',
    '¿cuál es el tiempo para conseguir la información?': 'scoringTiempoConseguirInfo',
    '¿cual es el tiempo para conseguir la informacion?': 'scoringTiempoConseguirInfo',
    '¿qué tan compleja es la implementación técnica?': 'scoringComplejidadTecnica',
    '¿que tan compleja es la implementacion tecnica?': 'scoringComplejidadTecnica',
    'complejidad del cambio a personas': 'scoringComplejidadCambio',
    
    # Totals and status
    'total esfuerzo': 'totalEsfuerzo',
    'puntaje total': 'puntajeTotal',
    'total valor': 'totalValor',
    'estatus y siguientes pasos': 'statusText',
    'acciones a ejecutar para acelerar': 'accionesAcelerar',
    'business impact usd$ growth / year estimated': 'businessImpactGrowth',
    'business impact usd$ costos': 'businessImpactCostos',
}

# Numeric fields that should be parsed as numbers
NUMERIC_FIELDS = {
    'ranking', 'totalEsfuerzo', 'puntajeTotal', 'totalValor', 'tiempoCicloDias',
    'previo', 'scoringNivelDemanda', 'scoringTieneSponsor', 'scoringPersonasAfecta',
    'scoringEsReplicable', 'scoringEsEstrategico', 'scoringTiempoDesarrollo',
    'scoringCalidadInformacion', 'scoringTiempoConseguirInfo', 'scoringComplejidadTecnica',
    'scoringComplejidadCambio', 'businessImpactGrowth', 'businessImpactCostos'
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
    NO fuzzy matching - only exact matches or contains checks.
    """
    normalized = normalize_header(col_name)
    
    if not normalized:
        return None
    
    # Step 1: Check for exact match first
    if normalized in EXACT_COLUMN_MAPPINGS:
        return EXACT_COLUMN_MAPPINGS[normalized]
    
    # Step 2: Check if header contains any key (for merged/prefixed headers)
    for key, db_field in EXACT_COLUMN_MAPPINGS.items():
        if key in normalized:
            return db_field
    
    # No match found
    return None


# =============================================================================
# VALUE PARSING FUNCTIONS
# =============================================================================

def clean_numeric(value: Any) -> Optional[float]:
    """Clean numeric value by removing currency symbols, commas, etc."""
    if pd.isna(value):
        return None
    
    text = str(value)
    cleaned = re.sub(r'[^\d.\-]', '', text)
    
    if not cleaned or cleaned in ['.', '-', '-.']:
        return None
    
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return None


def parse_date(value: Any) -> Optional[str]:
    """Parse date value to ISO format string."""
    if pd.isna(value):
        return None
    
    if isinstance(value, datetime):
        return value.strftime('%Y-%m-%d')
    
    text = str(value).strip()
    if not text:
        return None
    
    date_formats = [
        '%Y-%m-%d',
        '%d/%m/%Y',
        '%m/%d/%Y',
        '%d-%m-%Y',
        '%Y/%m/%d',
        '%d.%m.%Y',
    ]
    
    for fmt in date_formats:
        try:
            return datetime.strptime(text, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    
    return None


# =============================================================================
# HEADER ROW DETECTION
# =============================================================================

def find_header_row(df: pd.DataFrame, anchor_keyword: str = "iniciativa", max_rows: int = 15) -> Optional[int]:
    """
    Hunt for the header row by looking for the anchor keyword.
    Returns the row index where the anchor is found, or None.
    """
    anchor_lower = anchor_keyword.lower()
    
    for idx in range(min(max_rows, len(df))):
        row = df.iloc[idx]
        for cell in row:
            if pd.notna(cell) and anchor_lower in normalize_header(cell):
                return idx
    
    return None


# =============================================================================
# MAIN PARSING FUNCTION
# =============================================================================

def parse_excel(file_path: str, sheet_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Main parsing function with anchor row detection and DETERMINISTIC column mapping.
    
    Args:
        file_path: Path to the Excel file
        sheet_name: Optional sheet name (uses first sheet if not specified)
    
    Returns:
        Dictionary with 'success', 'projects', 'errors', and 'metadata'
    """
    result = {
        'success': False,
        'projects': [],
        'errors': [],
        'metadata': {
            'header_row': None,
            'total_rows': 0,
            'columns_mapped': {},
            'columns_unmapped': [],
        }
    }
    
    try:
        df_raw = pd.read_excel(
            file_path,
            sheet_name=sheet_name or 0,
            header=None,
            engine='openpyxl',
            dtype=str
        )
        
        header_row = find_header_row(df_raw, anchor_keyword='iniciativa')
        
        if header_row is None:
            result['errors'].append('No se encontró la fila de encabezado con "Iniciativa". Buscando alternativas...')
            header_row = find_header_row(df_raw, anchor_keyword='proyecto')
            
            if header_row is None:
                header_row = find_header_row(df_raw, anchor_keyword='nombre')
        
        if header_row is None:
            result['errors'].append('No se pudo detectar la fila de encabezado. El archivo debe contener columnas como "Iniciativa", "Proyecto" o "Nombre".')
            return result
        
        result['metadata']['header_row'] = header_row
        
        df = pd.read_excel(
            file_path,
            sheet_name=sheet_name or 0,
            header=header_row,
            engine='openpyxl',
            dtype=str
        )
        
        df = df.ffill()
        df = df.dropna(how='all')
        
        result['metadata']['total_rows'] = len(df)
        
        # Map columns using EXACT mappings only
        column_map = {}
        unmapped_columns = []
        
        for col in df.columns:
            mapped_field = map_column_name(str(col))
            if mapped_field:
                column_map[str(col)] = mapped_field
            else:
                unmapped_columns.append(str(col))
        
        result['metadata']['columns_mapped'] = column_map
        result['metadata']['columns_unmapped'] = unmapped_columns
        
        print(f"[PARSER] Column mappings found: {len(column_map)}", file=sys.stderr)
        print(f"[PARSER] Unmapped columns: {len(unmapped_columns)}", file=sys.stderr)
        
        projects = []
        
        for idx, row in df.iterrows():
            try:
                project = {}
                
                for excel_col, db_field in column_map.items():
                    value = row.get(excel_col)
                    
                    # Handle numeric fields
                    if db_field in NUMERIC_FIELDS:
                        num_val = clean_numeric(value)
                        if num_val is not None:
                            project[db_field] = num_val
                    
                    # Handle date fields
                    elif db_field in DATE_FIELDS:
                        date_val = parse_date(value)
                        if date_val:
                            project[db_field] = date_val
                    
                    # Handle all other fields as strings
                    else:
                        if pd.notna(value):
                            project[db_field] = str(value).strip()
                
                # Skip rows without project name
                if not project.get('projectName'):
                    result['errors'].append(f'Fila {idx + header_row + 2}: Sin nombre de proyecto, omitida.')
                    continue
                
                # Set defaults
                if not project.get('status'):
                    project['status'] = 'Draft'
                
                projects.append(project)
                
            except Exception as e:
                result['errors'].append(f'Fila {idx + header_row + 2}: Error procesando - {str(e)}')
        
        result['projects'] = projects
        result['success'] = True
        
        print(f"[PARSER] Successfully parsed {len(projects)} projects.", file=sys.stderr)
        
    except FileNotFoundError:
        result['errors'].append(f'Archivo no encontrado: {file_path}')
    except Exception as e:
        result['errors'].append(f'Error leyendo archivo Excel: {str(e)}')
    
    return result


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'errors': ['Uso: python excel_parser.py <archivo.xlsx>']}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    sheet_name = sys.argv[2] if len(sys.argv) > 2 else None
    
    result = parse_excel(file_path, sheet_name)
    print(json.dumps(result, ensure_ascii=False, default=str))

#!/usr/bin/env python3
"""
Excel Parser with Anchor Row Detection and DETERMINISTIC Column Mapping.
Uses EXACT 1:1 mappings for all Excel columns - NO fuzzy matching.
Handles multi-row headers (row 2 = scoring questions, row 3 = other headers).
"""

import sys
import json
import pandas as pd
import re
from datetime import datetime
from typing import Optional, Dict, List, Any


# =============================================================================
# EXACT COLUMN MAPPINGS - DETERMINISTIC 1:1
# Each key is a normalized header (lowercase, trimmed, single spaces)
# =============================================================================

EXACT_COLUMN_MAPPINGS = {
    # Row 1 headers
    'previo': 'previo',
    'ranking': 'ranking',
    'renking general': 'ranking',
    'id power steering': 'legacyId',
    'card id devops': 'cardIdDevops',
    'iniciativa': 'projectName',
    'descripción': 'problemStatement',
    'descripcion': 'problemStatement',
    'valor / diferenciador': 'valorDiferenciador',
    
    # Row 2/3 headers - dates and metadata
    'fecha de registro': 'registrationDate',
    'fecha inicio': 'startDate',
    'fecha de término / real o estimada': 'endDateEstimated',
    'fecha de termino / real o estimada': 'endDateEstimated',
    't. de ciclo en días': 'tiempoCicloDias',
    't. de ciclo en dias': 'tiempoCicloDias',
    'tiempo de ciclo en días': 'tiempoCicloDias',
    'tiempo de ciclo en dias': 'tiempoCicloDias',
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
    
    # Row 3 headers - people
    'dtc lead': 'dtcLead',
    'black belt lead': 'blackBeltLead',
    'dirección de negocio del usuario': 'direccionNegocioUsuario',
    'direccion de negocio del usuario': 'direccionNegocioUsuario',
    '¿impacta a gases envasados ?': 'impactaGasesEnvasados',
    '¿impacta a gases envasados?': 'impactaGasesEnvasados',
    'business process analyst': 'bpAnalyst',
    'área de productividad': 'areaProductividad',
    'area de productividad': 'areaProductividad',
    
    # ==========================================================================
    # SCORING MATRIX - VALOR (Value) columns from Row 2
    # ==========================================================================
    
    # Nivel demanda
    '¿en que nivel es detonada la necesidad?': 'scoringNivelDemanda',
    '¿en qué nivel es detonada la necesidad?': 'scoringNivelDemanda',
    '¿de qué nivel es demanda la necesidad?': 'scoringNivelDemanda',
    '¿de que nivel es demanda la necesidad?': 'scoringNivelDemanda',
    
    # Sponsor
    '¿tiene un sponsor o dueño?': 'scoringTieneSponsor',
    '¿tiene un sponsor o dueno?': 'scoringTieneSponsor',
    
    # Personas afecta
    '¿a cuántas personas afecta?': 'scoringPersonasAfecta',
    '¿a cuantas personas afecta?': 'scoringPersonasAfecta',
    '¿a cuántas personas /clientes impacta?': 'scoringPersonasAfecta',
    '¿a cuantas personas /clientes impacta?': 'scoringPersonasAfecta',
    
    # Strategic fit
    'alineado a objetivos estratég.': 'strategicFit',
    'alineado a objetivos estrateg.': 'strategicFit',
    'alineado a objetivos / estrategia': 'strategicFit',
    
    # Financial impact
    '¿cuál es el impacto en beneficios duros?': 'financialImpact',
    '¿cual es el impacto en beneficios duros?': 'financialImpact',
    '¿cuál es el impacto en beneficios duros anuales?': 'financialImpact',
    '¿cual es el impacto en beneficios duros anuales?': 'financialImpact',
    
    # Simplifica procesos
    '¿simplifica procesos o mejora el control?': 'scoringSimplificaProcesos',
    
    # Replicable
    '¿es replicable?': 'scoringEsReplicable',
    
    # Estratégico
    '¿es proyecto estratégico?': 'scoringEsEstrategico',
    '¿es proyecto estrategico?': 'scoringEsEstrategico',
    
    # ==========================================================================
    # SCORING MATRIX - ESFUERZO (Effort) columns from Row 2
    # ==========================================================================
    
    # Recursos externos
    '¿requiere recursos externos para el desarrollo? cantidad de personas': 'scoringRecursosExternos',
    '¿requiere recursos externos para el desarrollo?': 'scoringRecursosExternos',
    
    # CAPEX
    'requiere capex/inversión?': 'capexTier',
    'requiere capex/inversion?': 'capexTier',
    '¿requiere capex/inversión?': 'capexTier',
    '¿requiere capex/inversion?': 'capexTier',
    
    # Tiempo desarrollo
    '¿cuál es el tiempo de desarrollo?': 'scoringTiempoDesarrollo',
    '¿cual es el tiempo de desarrollo?': 'scoringTiempoDesarrollo',
    
    # Calidad información
    '¿cuál es la calidad de la información?': 'scoringCalidadInformacion',
    '¿cual es la calidad de la informacion?': 'scoringCalidadInformacion',
    '¿cuál es la calidad de datos y disponibilidad de la información?': 'scoringCalidadInformacion',
    '¿cual es la calidad de datos y disponibilidad de la informacion?': 'scoringCalidadInformacion',
    
    # Tiempo implementar
    '¿cuál es el tiempo para conseguir la información?': 'scoringTiempoConseguirInfo',
    '¿cual es el tiempo para conseguir la informacion?': 'scoringTiempoConseguirInfo',
    '¿cuál es el tiempo para implementar la solución?': 'scoringTiempoImplementar',
    '¿cual es el tiempo para implementar la solucion?': 'scoringTiempoImplementar',
    
    # Complejidad técnica
    '¿qué tan compleja es la implementación técnica?': 'scoringComplejidadTecnica',
    '¿que tan compleja es la implementacion tecnica?': 'scoringComplejidadTecnica',
    '¿qué tan compleja es la integración técnica de la(s) solucion digital?': 'scoringComplejidadTecnica',
    '¿que tan compleja es la integracion tecnica de la(s) solucion digital?': 'scoringComplejidadTecnica',
    
    # Complejidad cambio
    'complejidad del cambio a personas': 'scoringComplejidadCambio',
    '¿qué tan compleja es la implementacion? complejidad del nuevo proceso o cantidad de recursos para implementar': 'scoringComplejidadCambio',
    '¿que tan compleja es la implementacion? complejidad del nuevo proceso o cantidad de recursos para implementar': 'scoringComplejidadCambio',
    
    # ==========================================================================
    # TOTALS AND STATUS
    # ==========================================================================
    'valor': 'totalValor',
    'total valor': 'totalValor',
    'esfuerzo': 'totalEsfuerzo',
    'total esfuerzo': 'totalEsfuerzo',
    'puntaje total': 'puntajeTotal',
    'estatus y siguientes pasos': 'statusText',
    'acciones a ejecutar para acelerar': 'accionesAcelerar',
    
    # Business impact
    'business impact usd$ growth / year estimated': 'businessImpactGrowth',
    'business impact usd$ growth / year': 'businessImpactGrowth',
    'business impact usd$ costos': 'businessImpactCostos',
    'business impact (time, control, compliance)': 'businessImpactOther',
    
    # Phase/status
    'fase: nuevo / analisis / desarrollo / pruebas/ implementado / terminado': 'projectPhase',
}

# Numeric fields that should be parsed as numbers
NUMERIC_FIELDS = {
    'ranking', 'totalEsfuerzo', 'puntajeTotal', 'totalValor', 'tiempoCicloDias',
    'previo', 'scoringNivelDemanda', 'scoringTieneSponsor', 'scoringPersonasAfecta',
    'scoringEsReplicable', 'scoringEsEstrategico', 'scoringTiempoDesarrollo',
    'scoringCalidadInformacion', 'scoringTiempoConseguirInfo', 'scoringComplejidadTecnica',
    'scoringComplejidadCambio', 'businessImpactGrowth', 'businessImpactCostos',
    'scoringSimplificaProcesos', 'scoringRecursosExternos', 'scoringTiempoImplementar',
    'strategicFit', 'financialImpact', 'capexTier'
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
    3. Replace newlines with spaces
    4. Replace multiple spaces with single space
    """
    if pd.isna(text):
        return ""
    normalized = str(text).lower().strip()
    normalized = normalized.replace('\n', ' ')
    normalized = re.sub(r'\s+', ' ', normalized)
    return normalized


def map_column_name(col_name: str) -> Optional[str]:
    """
    Map Excel column header to database field using EXACT 1:1 mappings ONLY.
    NO fuzzy matching, NO substring matching - deterministic exact lookups only.
    """
    normalized = normalize_header(col_name)
    
    if not normalized:
        return None
    
    # EXACT match only - no substring fallback
    if normalized in EXACT_COLUMN_MAPPINGS:
        return EXACT_COLUMN_MAPPINGS[normalized]
    
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


def build_merged_headers(df_raw: pd.DataFrame, header_row: int) -> Dict[int, str]:
    """
    Build merged headers from multiple rows.
    For scoring columns, prefer row (header_row - 1) if it has question text.
    For other columns, use header_row.
    
    Returns a dict mapping column index -> best header text.
    """
    merged = {}
    prev_row_idx = header_row - 1 if header_row > 0 else header_row
    
    for col_idx in range(len(df_raw.columns)):
        # Get header from main row
        main_header = ""
        if col_idx < len(df_raw.iloc[header_row]):
            val = df_raw.iloc[header_row, col_idx]
            if pd.notna(val):
                main_header = str(val).strip()
        
        # Get header from previous row (for scoring questions)
        prev_header = ""
        if prev_row_idx != header_row and col_idx < len(df_raw.iloc[prev_row_idx]):
            val = df_raw.iloc[prev_row_idx, col_idx]
            if pd.notna(val):
                prev_header = str(val).strip()
        
        # Determine which header to use:
        # - If prev_header is a question (starts with ¿), use it
        # - If prev_header is scoring text (contains "nivel", "sponsor", etc.), use it
        # - Otherwise use main_header
        prev_normalized = normalize_header(prev_header)
        
        is_scoring_question = (
            prev_header.startswith('¿') or
            '¿' in prev_header or
            'nivel' in prev_normalized or
            'sponsor' in prev_normalized or
            'impacto' in prev_normalized or
            'capex' in prev_normalized or
            'replicable' in prev_normalized or
            'personas' in prev_normalized or
            'objetivos' in prev_normalized or
            'simplifica' in prev_normalized or
            'recursos externos' in prev_normalized or
            'tiempo de desarrollo' in prev_normalized or
            'calidad de datos' in prev_normalized or
            'compleja' in prev_normalized
        )
        
        if prev_header and is_scoring_question:
            merged[col_idx] = prev_header
        elif main_header:
            merged[col_idx] = main_header
        else:
            merged[col_idx] = f"Unnamed: {col_idx}"
    
    return merged


# =============================================================================
# MAIN PARSING FUNCTION
# =============================================================================

def parse_excel(file_path: str, sheet_name: Optional[str] = None, debug: bool = True) -> Dict[str, Any]:
    """
    Main parsing function with anchor row detection and DETERMINISTIC column mapping.
    Handles multi-row headers by merging scoring question headers from row above.
    
    Args:
        file_path: Path to the Excel file
        sheet_name: Optional sheet name (uses first sheet if not specified)
        debug: Whether to output debug logging for unmatched headers
    
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
            'debug_unmatched_headers': [],
        }
    }
    
    try:
        # Read raw data first to find header row and build merged headers
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
            result['errors'].append('No se pudo detectar la fila de encabezado.')
            return result
        
        result['metadata']['header_row'] = header_row
        
        # Build merged headers from multiple rows
        merged_headers = build_merged_headers(df_raw, header_row)
        
        if debug:
            print(f"[PARSER] Header row: {header_row}", file=sys.stderr)
            print(f"[PARSER] Merged headers (sample cols 22-38):", file=sys.stderr)
            for col_idx in range(22, min(39, len(merged_headers))):
                h = merged_headers.get(col_idx, '')
                print(f"[PARSER]   Col {col_idx}: {normalize_header(h)[:60]}", file=sys.stderr)
        
        # Read data starting after header row
        df = pd.read_excel(
            file_path,
            sheet_name=sheet_name or 0,
            header=None,
            skiprows=header_row + 1,
            engine='openpyxl',
            dtype=str
        )
        
        df = df.ffill()
        df = df.dropna(how='all')
        
        result['metadata']['total_rows'] = len(df)
        
        # Map columns using merged headers and EXACT mappings only
        column_map = {}
        mapped_fields = {} # Track fields already mapped to their column names
        unmapped_columns = []
        debug_unmatched = []
        
        for col_idx in range(len(df.columns)):
            header_text = merged_headers.get(col_idx, f"Unnamed: {col_idx}")
            normalized = normalize_header(header_text)
            mapped_field = map_column_name(header_text)
            
            if mapped_field:
                column_map[col_idx] = {'header': header_text, 'field': mapped_field}
            else:
                unmapped_columns.append(header_text)
                if debug and normalized and len(normalized) > 2:
                    debug_unmatched.append({
                        'col_idx': col_idx,
                        'original': header_text[:100],
                        'normalized': normalized[:100],
                    })
        
        result['metadata']['columns_mapped'] = {v['header']: v['field'] for v in column_map.values()}
        result['metadata']['columns_unmapped'] = unmapped_columns
        result['metadata']['debug_unmatched_headers'] = debug_unmatched
        
        print(f"[PARSER] Column mappings found: {len(column_map)}", file=sys.stderr)
        print(f"[PARSER] Unmapped columns: {len(unmapped_columns)}", file=sys.stderr)
        
        # Debug: print unmatched headers
        if debug and debug_unmatched:
            print(f"[PARSER] === UNMATCHED HEADERS ===", file=sys.stderr)
            for item in debug_unmatched[:15]:
                print(f"[PARSER]   Col {item['col_idx']}: '{item['normalized']}'", file=sys.stderr)
        
        # Debug: print what scoring fields we DID map
        scoring_fields = ['scoringNivelDemanda', 'scoringTieneSponsor', 'scoringPersonasAfecta', 
                         'strategicFit', 'financialImpact', 'scoringEsReplicable', 'capexTier',
                         'scoringTiempoDesarrollo', 'scoringCalidadInformacion', 'scoringComplejidadTecnica',
                         'scoringComplejidadCambio', 'businessImpactGrowth', 'businessImpactCostos',
                         'scoringSimplificaProcesos', 'scoringRecursosExternos', 'scoringTiempoImplementar']
        mapped_scoring = [v['field'] for v in column_map.values() if v['field'] in scoring_fields]
        print(f"[PARSER] Scoring fields mapped: {mapped_scoring}", file=sys.stderr)
        
        projects = []
        
        for idx, row in df.iterrows():
            try:
                project = {}
                
                for col_idx, mapping in column_map.items():
                    db_field = mapping['field']
                    value = row.iloc[col_idx] if col_idx < len(row) else None
                    
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
        
        # Debug: Sample first project to show what fields were captured
        if debug and projects:
            sample = projects[0]
            sample_scoring = {k: v for k, v in sample.items() if 'scoring' in k.lower() or 'impact' in k.lower() or k in ['strategicFit', 'financialImpact', 'capexTier']}
            print(f"[PARSER] Sample project scoring fields: {sample_scoring}", file=sys.stderr)
        
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
    
    result = parse_excel(file_path, sheet_name, debug=True)
    print(json.dumps(result, ensure_ascii=False, default=str))

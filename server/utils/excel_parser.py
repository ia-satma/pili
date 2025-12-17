#!/usr/bin/env python3
"""
Excel Parser with Anchor Row Detection and Scoring Matrix Mapping.
Handles messy Excel files with variable header positions and merged cells.
Implements EXACT hardcoded mappings for CAPEX, Financial Impact, and Strategic Fit.
"""

import sys
import json
import pandas as pd
import re
from datetime import datetime
from typing import Optional, Dict, List, Any, Tuple


# =============================================================================
# HARDCODED SCORING MATRIX MAPPINGS
# =============================================================================

def map_capex_tier(value: Any) -> Optional[str]:
    """
    Map CAPEX/Inversión column to tier using EXACT rules.
    Excel Header: "Requiere CAPEX" or "Inversión"
    """
    if pd.isna(value):
        return None
    
    text = str(value).lower().strip()
    
    # Rule 1: >100 KUSD -> HIGH_COST
    if ">100" in text or "> 100" in text:
        return "HIGH_COST"
    
    # Rule 2: 20 y 100 -> MEDIUM_COST
    if "20 y 100" in text or "20-100" in text or ("20" in text and "100" in text):
        return "MEDIUM_COST"
    
    # Rule 3: < 5 -> LOW_COST
    if "< 5" in text or "<5" in text or "< 20" in text or "<20" in text:
        return "LOW_COST"
    
    # Rule 4: No -> ZERO_COST
    if text == "no" or text.startswith("no ") or "no requiere" in text or "ninguno" in text:
        return "ZERO_COST"
    
    return None


def map_financial_impact(value: Any) -> Optional[str]:
    """
    Map Beneficios/Ventas column to financial impact using EXACT rules.
    Excel Header: "beneficios duros" or "Ventas Incrementales"
    """
    if pd.isna(value):
        return None
    
    text = str(value).lower().strip()
    
    # Rule 1: >300 -> HIGH_REVENUE
    if ">300" in text or "> 300" in text:
        return "HIGH_REVENUE"
    
    # Rule 2: 100 y 200 -> MEDIUM_REVENUE (also handle 200 y 300, etc.)
    if ("100" in text and "200" in text) or ("200" in text and "300" in text):
        return "MEDIUM_REVENUE"
    
    # Rule 3: <100 -> LOW_REVENUE
    if "<100" in text or "< 100" in text:
        return "LOW_REVENUE"
    
    # Rule 4: Ninguno -> NONE
    if "ninguno" in text or text == "no" or "sin beneficio" in text:
        return "NONE"
    
    return None


def map_strategic_fit(value: Any) -> Optional[str]:
    """
    Map Alineación column to strategic fit using EXACT rules.
    Excel Header: "Alineado a Objetivos"
    """
    if pd.isna(value):
        return None
    
    text = str(value).lower().strip()
    
    # Rule 1: Si -> FULL
    if text == "si" or text == "sí" or text.startswith("si ") or text.startswith("sí "):
        return "FULL"
    
    # Rule 2: Parcialmente -> PARTIAL
    if "parcial" in text:
        return "PARTIAL"
    
    # Rule 3: No -> NONE
    if text == "no" or text.startswith("no "):
        return "NONE"
    
    return None


def find_scoring_columns(columns: List[str]) -> Dict[str, str]:
    """
    Find the scoring matrix columns in the Excel using hardcoded header patterns.
    Returns mapping of {db_field: excel_column_name}
    """
    scoring_map = {}
    
    for col in columns:
        col_lower = str(col).lower().strip()
        
        # CAPEX/Inversión column
        if "capex" in col_lower or "inversión" in col_lower or "inversion" in col_lower:
            scoring_map['capexTier'] = col
        
        # Beneficios/Ventas column
        elif "beneficios duros" in col_lower or "ventas incrementales" in col_lower:
            scoring_map['financialImpact'] = col
        
        # Alineación column
        elif "alineado" in col_lower and "objetivo" in col_lower:
            scoring_map['strategicFit'] = col
    
    return scoring_map


# =============================================================================
# CORE PARSING FUNCTIONS
# =============================================================================

def normalize_text(text: Any) -> str:
    """Normalize text for comparison (lowercase, strip whitespace)."""
    if pd.isna(text):
        return ""
    return str(text).strip().lower()


def find_header_row(df: pd.DataFrame, anchor_keyword: str = "iniciativa", max_rows: int = 15) -> Optional[int]:
    """
    Hunt for the header row by looking for the anchor keyword.
    Returns the row index where the anchor is found, or None.
    """
    anchor_lower = anchor_keyword.lower()
    
    for idx in range(min(max_rows, len(df))):
        row = df.iloc[idx]
        for cell in row:
            if anchor_lower in normalize_text(cell):
                return idx
    
    return None


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


def map_column_name(col_name: str) -> Optional[str]:
    """
    Map Excel column headers to database schema fields using fuzzy matching.
    Uses EXACT matches first, then partial matches for general columns.
    """
    col_lower = normalize_text(col_name)
    
    # EXACT MATCH MAPPINGS (check these first to avoid false positives)
    # These columns have keywords that could match other columns if not checked first
    exact_mappings = {
        'iniciativa': 'projectName',
        'tipo de iniciativa': 'status',
        'estatus al día': 'estatusAlDia',
        'estatus al dia': 'estatusAlDia',
        'proceso de negocio': 'departmentName',
        'líder o solicitante': 'leader',
        'lider o solicitante': 'leader',
        'total valor': 'totalValor',
        'total esfuerzo': 'totalEsfuerzo',
        'puntaje total': 'puntajeTotal',
        'ranking': 'ranking',
        'id power steering': 'legacyId',
        'card id devops': 'legacyId',
        'fecha de registro': 'registrationDate',
        'fecha inicio': 'startDate',
        'fecha de término / real o estimada': 'endDateEstimated',
        'fecha de termino / real o estimada': 'endDateEstimated',
        'estatus y siguientes pasos': 'statusText',
        'valor / diferenciador': 'description',
        'dueño del proceso': 'sponsor',
        'business process analyst': 'bpAnalyst',
    }
    
    # Check exact match first
    if col_lower in exact_mappings:
        return exact_mappings[col_lower]
    
    # Check if column starts with certain prefixes (for long headers)
    prefix_mappings = [
        ('fase:', 'fase'),
        ('estatus y siguientes', 'statusText'),
        ('business impact', 'benefits'),
    ]
    
    for prefix, field in prefix_mappings:
        if col_lower.startswith(prefix):
            return field
    
    # PARTIAL MATCH MAPPINGS (for general columns)
    # These are checked after exact matches to avoid conflicts
    partial_mappings = [
        (['descripcion', 'descripción', 'problema', 'planteamiento'], 'problemStatement'),
        (['sponsor', 'patrocinador'], 'sponsor'),
        (['analista', 'bp analyst', 'bp_analyst', 'analyst'], 'bpAnalyst'),
        (['region', 'región'], 'region'),
        (['objetivo', 'objective', 'goal'], 'objective'),
        (['alcance', 'scope', 'scope in', 'dentro alcance'], 'scopeIn'),
        (['fuera alcance', 'scope out', 'fuera de alcance'], 'scopeOut'),
        (['tipo impacto', 'impact type'], 'impactType'),
        (['kpi', 'kpis', 'indicadores'], 'kpis'),
        (['prioridad', 'priority'], 'priority'),
        (['categoria', 'categoría', 'category'], 'category'),
        (['comentarios', 'comments', 'notas', 'notes'], 'comments'),
        (['riesgos', 'risks'], 'risks'),
        (['% avance', 'porcentaje', 'percent complete', 'avance', '% completado'], 'percentComplete'),
    ]
    
    for keywords, field_name in partial_mappings:
        for keyword in keywords:
            if keyword in col_lower:
                return field_name
    
    return None


def parse_excel(file_path: str, sheet_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Main parsing function with anchor row detection and scoring matrix mapping.
    
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
            'scoring_columns_found': {},
            'scoring_summary': {
                'high_cost_count': 0,
                'medium_cost_count': 0,
                'low_cost_count': 0,
                'zero_cost_count': 0,
                'high_revenue_count': 0,
                'full_alignment_count': 0,
            }
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
        
        # Find scoring matrix columns
        scoring_columns = find_scoring_columns(list(df.columns))
        result['metadata']['scoring_columns_found'] = scoring_columns
        
        projects = []
        summary = result['metadata']['scoring_summary']
        
        for idx, row in df.iterrows():
            try:
                project = {}
                
                for excel_col, db_field in column_map.items():
                    value = row.get(excel_col)
                    
                    if db_field == 'budget':
                        project[db_field] = clean_numeric(value) or 0
                    elif db_field in ['totalValor', 'totalEsfuerzo', 'puntajeTotal', 'ranking']:
                        # Numeric fields - parse as integer
                        num_val = clean_numeric(value)
                        if num_val is not None:
                            project[db_field] = int(num_val)
                    elif db_field == 'percentComplete':
                        pct = clean_numeric(value)
                        if pct is not None:
                            if pct > 1:
                                pct = min(pct, 100)
                            else:
                                pct = pct * 100
                            project[db_field] = int(pct)
                    elif db_field in ['startDate', 'endDateEstimated', 'registrationDate']:
                        project[db_field] = parse_date(value)
                    elif db_field == 'impactType':
                        if pd.notna(value):
                            types = [t.strip() for t in str(value).split(',') if t.strip()]
                            project[db_field] = types
                    else:
                        if pd.notna(value):
                            project[db_field] = str(value).strip()
                
                # =============================================
                # SCORING MATRIX EXACT MAPPING
                # =============================================
                
                # Map CAPEX Tier
                if 'capexTier' in scoring_columns:
                    raw_value = row.get(scoring_columns['capexTier'])
                    tier = map_capex_tier(raw_value)
                    if tier:
                        project['capexTier'] = tier
                        if tier == 'HIGH_COST':
                            summary['high_cost_count'] += 1
                        elif tier == 'MEDIUM_COST':
                            summary['medium_cost_count'] += 1
                        elif tier == 'LOW_COST':
                            summary['low_cost_count'] += 1
                        elif tier == 'ZERO_COST':
                            summary['zero_cost_count'] += 1
                
                # Map Financial Impact
                if 'financialImpact' in scoring_columns:
                    raw_value = row.get(scoring_columns['financialImpact'])
                    impact = map_financial_impact(raw_value)
                    if impact:
                        project['financialImpact'] = impact
                        if impact == 'HIGH_REVENUE':
                            summary['high_revenue_count'] += 1
                
                # Map Strategic Fit
                if 'strategicFit' in scoring_columns:
                    raw_value = row.get(scoring_columns['strategicFit'])
                    fit = map_strategic_fit(raw_value)
                    if fit:
                        project['strategicFit'] = fit
                        if fit == 'FULL':
                            summary['full_alignment_count'] += 1
                
                if not project.get('projectName'):
                    result['errors'].append(f'Fila {idx + header_row + 2}: Sin nombre de proyecto, omitida.')
                    continue
                
                if not project.get('status'):
                    project['status'] = 'Draft'
                
                if not project.get('priority'):
                    project['priority'] = 'Media'
                
                projects.append(project)
                
            except Exception as e:
                result['errors'].append(f'Fila {idx + header_row + 2}: Error procesando - {str(e)}')
        
        result['projects'] = projects
        result['success'] = True
        
        # Print summary to console
        print(f"[PARSER] Parsed {len(projects)} rows.", file=sys.stderr)
        print(f"[PARSER] Scoring Matrix Summary:", file=sys.stderr)
        print(f"  - HIGH_COST projects: {summary['high_cost_count']}", file=sys.stderr)
        print(f"  - MEDIUM_COST projects: {summary['medium_cost_count']}", file=sys.stderr)
        print(f"  - LOW_COST projects: {summary['low_cost_count']}", file=sys.stderr)
        print(f"  - ZERO_COST projects: {summary['zero_cost_count']}", file=sys.stderr)
        print(f"  - HIGH_REVENUE projects: {summary['high_revenue_count']}", file=sys.stderr)
        print(f"  - FULL alignment projects: {summary['full_alignment_count']}", file=sys.stderr)
        
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

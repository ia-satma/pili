#!/usr/bin/env python3
"""
Excel Parser with Anchor Row Detection
Handles messy Excel files with variable header positions and merged cells.
"""

import sys
import json
import pandas as pd
import re
from datetime import datetime
from typing import Optional, Dict, List, Any


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
    """
    col_lower = normalize_text(col_name)
    
    mappings = [
        (['iniciativa', 'nombre proyecto', 'proyecto', 'nombre', 'name'], 'projectName'),
        (['descripcion', 'descripción', 'problema', 'planteamiento', 'problem statement'], 'problemStatement'),
        (['dueño', 'dueno', 'owner', 'sponsor', 'patrocinador'], 'sponsor'),
        (['lider', 'líder', 'leader', 'responsable'], 'leader'),
        (['analista', 'bp analyst', 'bp_analyst', 'analyst'], 'bpAnalyst'),
        (['total esfuerzo', 'esfuerzo', 'effort', 'presupuesto', 'budget', 'costo', 'cost'], 'budget'),
        (['fecha inicio', 'fecha_inicio', 'start date', 'inicio', 'start'], 'startDate'),
        (['fecha fin', 'fecha_fin', 'end date', 'fin', 'end', 'fecha estimada'], 'endDateEstimated'),
        (['estado', 'status', 'estatus'], 'status'),
        (['departamento', 'department', 'area', 'área'], 'departmentName'),
        (['region', 'región'], 'region'),
        (['objetivo', 'objective', 'goal'], 'objective'),
        (['alcance', 'scope', 'scope in', 'dentro alcance'], 'scopeIn'),
        (['fuera alcance', 'scope out', 'fuera de alcance'], 'scopeOut'),
        (['tipo impacto', 'impact type', 'impacto'], 'impactType'),
        (['kpi', 'kpis', 'indicadores'], 'kpis'),
        (['prioridad', 'priority'], 'priority'),
        (['categoria', 'categoría', 'category'], 'category'),
        (['comentarios', 'comments', 'notas', 'notes'], 'comments'),
        (['beneficios', 'benefits'], 'benefits'),
        (['riesgos', 'risks'], 'risks'),
        (['% avance', 'porcentaje', 'percent complete', 'avance', '% completado'], 'percentComplete'),
        (['total valor', 'valor', 'value'], 'totalValor'),
    ]
    
    for keywords, field_name in mappings:
        for keyword in keywords:
            if keyword in col_lower or col_lower in keyword:
                return field_name
    
    return None


def parse_excel(file_path: str, sheet_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Main parsing function with anchor row detection.
    
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
            'columns_unmapped': []
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
        
        projects = []
        
        for idx, row in df.iterrows():
            try:
                project = {}
                
                for excel_col, db_field in column_map.items():
                    value = row.get(excel_col)
                    
                    if db_field == 'budget':
                        project[db_field] = clean_numeric(value) or 0
                    elif db_field == 'totalValor':
                        project[db_field] = clean_numeric(value)
                    elif db_field == 'percentComplete':
                        pct = clean_numeric(value)
                        if pct is not None:
                            if pct > 1:
                                pct = min(pct, 100)
                            else:
                                pct = pct * 100
                            project[db_field] = int(pct)
                    elif db_field in ['startDate', 'endDateEstimated']:
                        project[db_field] = parse_date(value)
                    elif db_field == 'impactType':
                        if pd.notna(value):
                            types = [t.strip() for t in str(value).split(',') if t.strip()]
                            project[db_field] = types
                    else:
                        if pd.notna(value):
                            project[db_field] = str(value).strip()
                
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

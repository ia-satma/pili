import zipfile
import xml.etree.ElementTree as ET
import os
from collections import Counter

def analyze_cols(file_path):
    with zipfile.ZipFile(file_path, 'r') as z:
        # Get shared strings
        strings = []
        try:
            with z.open('xl/sharedStrings.xml') as f:
                root = ET.parse(f).getroot()
                for si in root.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                    t_nodes = si.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                    text = "".join([t.text for t in t_nodes if t.text])
                    strings.append(text)
        except:
            pass

        # Get sheet data (assume sheet1 is usually the main data)
        with z.open('xl/worksheets/sheet1.xml') as f:
            root = ET.parse(f).getroot()
            
            col_data = {} # col -> list of values
            for row_node in root.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
                for cell in row_node.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                    r = cell.get('r')
                    col = "".join([c for c in r if not c.isdigit()])
                    t = cell.get('t')
                    v_node = cell.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                    val = None
                    if v_node is not None:
                        val = v_node.text
                        if t == 's' and val:
                            idx = int(val)
                            if idx < len(strings):
                                val = strings[idx]
                    
                    if val:
                        if col not in col_data: col_data[col] = []
                        col_data[col].append(val)

    print(f"Values in Column C: {col_data.get('C', [])}")

analyze_cols('attached_assets/pilar_prueba_1766008488535.xlsx')

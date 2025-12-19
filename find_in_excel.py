import zipfile
import xml.etree.ElementTree as ET
import os

def find_string_in_excel(file_path, search_str):
    if not os.path.exists(file_path):
        print(f"File {file_path} not found")
        return

    with zipfile.ZipFile(file_path, 'r') as z:
        # 1. Look for the string in sharedStrings.xml
        try:
            with z.open('xl/sharedStrings.xml') as f:
                tree = ET.parse(f)
                root = tree.getroot()
                # Namespaces can be tricky with ET, find all <t> elements
                strings = [t.text for t in root.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')]
                
                target_indices = [i for i, s in enumerate(strings) if s and search_str in s]
                if not target_indices:
                    print(f"String '{search_str}' not found in sharedStrings.xml")
                    # It might be an inline string or a number?
                else:
                    print(f"Found '{search_str}' in sharedStrings.xml at indices: {target_indices}")
        except KeyError:
            print("xl/sharedStrings.xml not found")
            target_indices = []

        # 2. Look in worksheets
        sheet_files = [name for name in z.namelist() if name.startswith('xl/worksheets/sheet')]
        for sheet_file in sheet_files:
            matches = []
            with z.open(sheet_file) as f:
                tree = ET.parse(f)
                root = tree.getroot()
                
                # Find cells that use these shared string indices
                for cell in root.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                    r = cell.get('r') # e.g. "A1"
                    t = cell.get('t') # type, "s" means shared string
                    v_node = cell.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                    
                    if v_node is not None:
                        val = v_node.text
                        if t == 's' and val and int(val) in target_indices:
                            matches.append(r)
                        elif val and search_str in val:
                            matches.append(r)
            
            if matches:
                print(f"Found {len(matches)} matches in {sheet_file}:")
                # Group by column
                cols = {}
                for m in matches:
                    col = ''.join([c for c in m if not c.isdigit()])
                    cols[col] = cols.get(col, 0) + 1
                for col, count in cols.items():
                    print(f"  Column {col}: {count} occurrences")
                if len(matches) < 20:
                    print(f"  Cells: {matches}")
                else:
                    print(f"  First 20 cells: {matches[:20]}")

find_string_in_excel('attached_assets/pilar_prueba_1766008488535.xlsx', 'Sitio de Sharepoint')

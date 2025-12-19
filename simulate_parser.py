import zipfile
import xml.etree.ElementTree as ET
import os

def simulate_parser(file_path):
    import zipfile
    import xml.etree.ElementTree as ET

    with zipfile.ZipFile(file_path, 'r') as z:
        # Get shared strings
        strings = []
        try:
            with z.open('xl/sharedStrings.xml') as f:
                root = ET.parse(f).getroot()
                # Find all <t> elements, including nested ones
                for si in root.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                    t_nodes = si.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                    text = "".join([t.text for t in t_nodes if t.text])
                    strings.append(text)
        except:
            pass

        # Get sheet data
        with z.open('xl/worksheets/sheet1.xml') as f:
            root = ET.parse(f).getroot()
            
            rows = []
            for row_node in root.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
                row_idx = int(row_node.get('r'))
                row_data = {}
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
                    row_data[col] = val
                rows.append((row_idx, row_data))

    # Dynamic Header Detection Logic
    recognized_headers = ["iniciativa", "nombre", "proyecto", "id power steering", "id ps", "status", "estatus", "total valor", "total esfuerzo"]
    
    best_row_idx = -1
    max_matches = 0
    header_row = None

    for idx, row_data in rows[:30]:
        matches = 0
        for val in row_data.values():
            if val:
                norm = str(val).lower().strip()
                if any(h in norm for h in recognized_headers):
                    matches += 1
        
        if matches > max_matches:
            max_matches = matches
            best_row_idx = idx
            header_row = row_data
        
        if matches >= 4:
            break

    print(f"Header suspected at Row {best_row_idx} with {max_matches} matches")
    if header_row:
        sorted_cols = sorted(header_row.keys(), key=lambda x: (len(x), x))
        print("Header content:")
        for col in sorted_cols:
            print(f"  {col}: {header_row[col]}")

    # Parse all projects
    parsed_projects = []
    data_rows = rows[best_row_idx:] # best_row_idx is 1-based from Excel? No, loop says `idx`
    
    # Helper to get index by aliases
    def get_idx(aliases, header_row):
        for alias in aliases:
            for col, val in header_row.items():
                if val and alias in str(val).lower():
                    return col
        return None

    initiative_aliases = ["iniciativa", "nombre", "proyecto", "nombre del proyecto", "project name"]
    id_aliases = ["id power steering", "id ps", "id", "código", "codigo", "card id devops"]

    header_row_data = header_row
    init_col = get_idx(initiative_aliases, header_row_data)
    id_col = get_idx(id_aliases, header_row_data)

    print(f"\nUsing Init Col: {init_col}, ID Col: {id_col}")

    # Search for AM03473 in all rows
    print("\n--- Rows containing 'AM03473' ---")
    count = 0
    for idx, row_data in rows:
        for col, val in row_data.items():
            if val and 'AM03473' in str(val):
                print(f"Row {idx}, Col {col}: {val}")
                count += 1
    print(f"Total occurrences: {count}")

    print("\n--- FIRST 20 PROJECTS ---")
    for idx, row_data in rows[best_row_idx:]:
        init_val = row_data.get(init_col)
        id_val = row_data.get(id_col)
        if init_val:
            print(f"Row {idx}: Name='{init_val}', ID='{id_val}'")
            if len(parsed_projects) < 20:
                parsed_projects.append((init_val, id_val))
            else:
                break

simulate_parser('attached_assets/pilar_prueba_1766008488535.xlsx')

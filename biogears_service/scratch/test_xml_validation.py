import sys
from pathlib import Path
try:
    from lxml import etree # type: ignore
except ImportError:
    import xml.etree.ElementTree as etree # type: ignore

def main():
    xsd_path = Path("/home/akhilreddy/health-digital-twin/biogears_runtime/xsd/BioGearsDataModel.xsd")
    if not xsd_path.exists():
        print(f"XSD file not found at {xsd_path}")
        sys.exit(1)
        
    xml_path = Path("/home/akhilreddy/health-digital-twin/biogears_runtime/Scenarios/API/batch_test_user_fresh_1780904378.xml")
    if not xml_path.exists():
        # Let's find any .xml file in Scenarios/API/
        api_dir = Path("/home/akhilreddy/health-digital-twin/biogears_runtime/Scenarios/API/")
        xmls = list(api_dir.glob("*.xml"))
        if xmls:
            xml_path = xmls[0]
        else:
            print("No scenario XML found to test.")
            sys.exit(1)

    print(f"Testing validation of {xml_path.name} against {xsd_path.name}")
    try:
        # Load and parse XSD schema
        # Since lxml handles relative schema imports relative to the file path of the main schema,
        # parsing from a path object or string path allows resolution of cdm/*.xsd and biogears/*.xsd.
        schema_doc = etree.parse(str(xsd_path))
        schema_cls = getattr(etree, "XMLSchema", None)
        if schema_cls:
            schema = schema_cls(schema_doc)
            xml_doc = etree.parse(str(xml_path))
            is_valid = schema.validate(xml_doc)
            print(f"Valid: {is_valid}")
            if not is_valid:
                print("Errors:")
                for error in getattr(schema, "error_log", []):
                    print(f"  Line {error.line}: {error.message}")
        else:
            print("lxml.etree XMLSchema not available.")
    except Exception as e:
        print(f"Error during validation: {e}")

if __name__ == "__main__":
    main()

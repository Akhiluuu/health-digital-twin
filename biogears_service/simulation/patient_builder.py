"""
patient_builder.py — Legacy BioGears XML scenario builder (v2).

NOTE: This module is a legacy fallback. The primary path for scenario generation
is biogears_service.simulation.scenario_builder which has the full feature set.
This module is kept for backwards compatibility with any code that may still
call build_initialization_scenario() or build_runtime_scenario().

Fixes vs v1:
  - Removed invalid XML comments (# ...) embedded in XML strings
  - Removed invalid contentVersion and xsi:schemaLocation attributes
  - Fixed SerializeStateData placement (inside action flow, not bare element)
  - Corrected EngineStateFile path to use absolute path pattern
  - build_initialization_scenario now generates a proper patient XML inline
    (no longer references StandardMale.xml which may not exist)
  - Removed <Actions> wrapper element (not valid in BioGears CDM v7.3)
"""

from pathlib import Path
from biogears_service.simulation.config import SCENARIO_API_DIR, BIOGEARS_BIN_DIR


def build_initialization_scenario(
    user_id: str,
    age: int,
    weight: float,
    height: float,
    sex: str,
    body_fat: float,
    hr: float,
    rr: float,
    sys: float,
    dia: float,
) -> str:
    """
    Builds a BioGears initialization scenario that creates a patient state file.
    Returns the absolute path to the written scenario file.
    """
    # Clamp to BioGears-safe ranges
    age      = max(18, min(80, int(age)))
    weight   = max(30.0, min(200.0, float(weight)))
    height   = max(140.0, min(220.0, float(height)))
    body_fat = max(0.02, min(0.70, float(body_fat)))
    hr       = max(50.0, min(100.0, float(hr)))
    rr       = max(8.0,  min(25.0,  float(rr)))
    sys      = max(85.0, min(160.0, float(sys)))
    dia      = max(55.0, min(95.0,  float(dia)))

    scenario_file = SCENARIO_API_DIR / f"init_{user_id}.xml"
    patient_file  = SCENARIO_API_DIR / f"patient_{user_id}.xml"
    abs_patient   = patient_file.absolute().as_posix()
    abs_state_out = (BIOGEARS_BIN_DIR / f"{user_id}.xml").absolute().as_posix()

    # Write patient XML
    p_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n'
        '<Patient xmlns="uri:/mil/tatrc/physiology/datamodel">\n'
        f'    <Name>{user_id}</Name>\n'
        f'    <Sex>{sex}</Sex>\n'
        f'    <Age value="{age}" unit="yr"/>\n'
        f'    <Weight value="{weight}" unit="kg"/>\n'
        f'    <Height value="{height}" unit="cm"/>\n'
        f'    <BodyFatFraction value="{body_fat}"/>\n'
        f'    <HeartRateBaseline value="{hr}" unit="1/min"/>\n'
        f'    <RespirationRateBaseline value="{rr}" unit="1/min"/>\n'
        f'    <SystolicArterialPressureBaseline value="{sys}" unit="mmHg"/>\n'
        f'    <DiastolicArterialPressureBaseline value="{dia}" unit="mmHg"/>\n'
        '</Patient>'
    )
    patient_file.write_text(p_xml, encoding="utf-8")

    # Write scenario XML — uses InitialParameters with PatientFile
    s_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n'
        '<Scenario xmlns="uri:/mil/tatrc/physiology/datamodel"'
        ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n'
        '    <InitialParameters>\n'
        f'        <PatientFile>{abs_patient}</PatientFile>\n'
        '    </InitialParameters>\n'
        '        <Action xsi:type="AdvanceTimeData"><Time value="300" unit="s"/></Action>\n'
        f'        <Action xsi:type="SerializeStateData" Type="Save">'
        f'<Filename>{abs_state_out}</Filename></Action>\n'
        '</Scenario>'
    )
    scenario_file.write_text(s_xml, encoding="utf-8")
    return str(scenario_file.absolute())


def build_runtime_scenario(user_id: str, simulation_time: int) -> str:
    """
    Builds a simple continuation scenario that advances time from the saved state.
    Returns the absolute path to the written scenario file.
    """
    simulation_time = max(10, int(simulation_time))

    scenario_file = SCENARIO_API_DIR / f"run_{user_id}.xml"
    abs_state_in  = (BIOGEARS_BIN_DIR / f"{user_id}.xml").absolute().as_posix()
    csv_prefix    = f"run_{user_id}"

    s_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n'
        '<Scenario xmlns="uri:/mil/tatrc/physiology/datamodel"'
        ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n'
        f'    <EngineStateFile>{abs_state_in}</EngineStateFile>\n'
        f'    <DataRequests Filename="Scenarios/API/{csv_prefix}Results.csv">\n'
        '        <DataRequest xsi:type="PhysiologyDataRequestData"'
        ' Name="HeartRate" Unit="1/min" Precision="2"/>\n'
        '        <DataRequest xsi:type="PhysiologyDataRequestData"'
        ' Name="MeanArterialPressure" Unit="mmHg" Precision="1"/>\n'
        '        <DataRequest xsi:type="PhysiologyDataRequestData"'
        ' Name="OxygenSaturation" Unit="unitless" Precision="3"/>\n'
        '    </DataRequests>\n'
        f'        <Action xsi:type="AdvanceTimeData">'
        f'<Time value="{simulation_time}" unit="s"/></Action>\n'
        '</Scenario>'
    )
    scenario_file.write_text(s_xml, encoding="utf-8")
    return str(scenario_file.absolute())

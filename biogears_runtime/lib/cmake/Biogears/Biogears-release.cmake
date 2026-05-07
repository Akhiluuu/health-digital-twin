#----------------------------------------------------------------
# Generated CMake target import file for configuration "Release".
#----------------------------------------------------------------

# Commands may need to know the format version.
set(CMAKE_IMPORT_FILE_VERSION 1)

# Import target "Biogears::libbiogears_common" for configuration "Release"
set_property(TARGET Biogears::libbiogears_common APPEND PROPERTY IMPORTED_CONFIGURATIONS RELEASE)
set_target_properties(Biogears::libbiogears_common PROPERTIES
  IMPORTED_LINK_INTERFACE_LANGUAGES_RELEASE "CXX"
  IMPORTED_LOCATION_RELEASE "${_IMPORT_PREFIX}/lib//libbiogears_common_st.a"
  )

list(APPEND _IMPORT_CHECK_TARGETS Biogears::libbiogears_common )
list(APPEND _IMPORT_CHECK_FILES_FOR_Biogears::libbiogears_common "${_IMPORT_PREFIX}/lib//libbiogears_common_st.a" )

# Import target "Biogears::libbiogears_cdm" for configuration "Release"
set_property(TARGET Biogears::libbiogears_cdm APPEND PROPERTY IMPORTED_CONFIGURATIONS RELEASE)
set_target_properties(Biogears::libbiogears_cdm PROPERTIES
  IMPORTED_LOCATION_RELEASE "${_IMPORT_PREFIX}/lib//libbiogears_cdm.so.7.3"
  IMPORTED_SONAME_RELEASE "libbiogears_cdm.so.7.3"
  )

list(APPEND _IMPORT_CHECK_TARGETS Biogears::libbiogears_cdm )
list(APPEND _IMPORT_CHECK_FILES_FOR_Biogears::libbiogears_cdm "${_IMPORT_PREFIX}/lib//libbiogears_cdm.so.7.3" )

# Import target "Biogears::libbiogears_circuit_test" for configuration "Release"
set_property(TARGET Biogears::libbiogears_circuit_test APPEND PROPERTY IMPORTED_CONFIGURATIONS RELEASE)
set_target_properties(Biogears::libbiogears_circuit_test PROPERTIES
  IMPORTED_LOCATION_RELEASE "${_IMPORT_PREFIX}/lib//libbiogears_circuit_test.so.7.3"
  IMPORTED_SONAME_RELEASE "libbiogears_circuit_test.so.7.3"
  )

list(APPEND _IMPORT_CHECK_TARGETS Biogears::libbiogears_circuit_test )
list(APPEND _IMPORT_CHECK_FILES_FOR_Biogears::libbiogears_circuit_test "${_IMPORT_PREFIX}/lib//libbiogears_circuit_test.so.7.3" )

# Import target "Biogears::libbiogears" for configuration "Release"
set_property(TARGET Biogears::libbiogears APPEND PROPERTY IMPORTED_CONFIGURATIONS RELEASE)
set_target_properties(Biogears::libbiogears PROPERTIES
  IMPORTED_LOCATION_RELEASE "${_IMPORT_PREFIX}/lib//libbiogears.so.7.3"
  IMPORTED_SONAME_RELEASE "libbiogears.so.7.3"
  )

list(APPEND _IMPORT_CHECK_TARGETS Biogears::libbiogears )
list(APPEND _IMPORT_CHECK_FILES_FOR_Biogears::libbiogears "${_IMPORT_PREFIX}/lib//libbiogears.so.7.3" )

# Commands beyond this point should not need to know the version.
set(CMAKE_IMPORT_FILE_VERSION)

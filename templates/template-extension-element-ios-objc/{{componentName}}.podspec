Pod::Spec.new do |s|
  s.name            = "{{componentName}}"
  s.version         = "0.1"
  s.summary         = "Lepo lynx component"
  s.description     = "Lepo lynx component"
  s.homepage        = "https://code.byted.org/lynx/template-assembler"
  s.license         = "MIT"
  s.platforms       = { :ios => "10.0" }
  s.author          = "Lynx"
  s.source          = { :git => "git@code.byted.org:lynx/template-assembler.git" }

  s.source_files    = "**/*.{h,m,mm,swift}"

  s.dependency      "Lynx"
end
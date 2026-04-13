$src = "c:\Clinic system project\dental-saas\dental-chart-pro v2\src\components\orthodontics\patient\OrthoRecordsTab.tsx"
$dst = "c:\Clinic system project\dental-saas\frontend\src\org\modules\patients\components\orthodontic-chart\components\cases\OrthoRecordsTab.tsx"
$c = [IO.File]::ReadAllText($src)
$c = $c.Replace("from 'framer-motion'", "from 'motion/react'").Replace("from '../../../types'", "from '../../types'")
[IO.File]::WriteAllText($dst, $c)
Write-Output "DONE_RECORDS"

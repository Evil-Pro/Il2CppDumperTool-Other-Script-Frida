/**
 * @Author lzy <axhlzy@live.cn>
 * @HomePage https://github.com/axhlzy
 * @CreatedTime 2021/01/16 09:23
 * @UpdateTime 2021/03/18 11:29
 * @Des frida hook u3d functions scrpt
 */

const soName = "libil2cpp.so"
const p_size = Process.pointerSize
var soAddr = 0

//声明一些需要用到的导出函数
var il2cpp_get_corlib,il2cpp_domain_get,il2cpp_domain_get_assemblies,il2cpp_assembly_get_image,
    il2cpp_image_get_class_count,il2cpp_image_get_class,
    il2cpp_class_get_methods,il2cpp_class_from_type,il2cpp_class_get_type,il2cpp_class_from_system_type,il2cpp_class_from_name,il2cpp_class_get_method_from_name,
    il2cpp_string_new,il2cpp_type_get_name,il2cpp_type_get_class_or_element_class

//不要LOG的时候值为false，需要时候true
var LogFlag = true
//count_method_times数组用于记录 breakPoints 中方法出现的次数
var count_method_times
//断点的函数出现次数大于 maxCallTime 即不显示
const maxCallTime = 20
//存放初始化（list_Images）时候的 imgaddr 以及 imgName
var arr_img_addr    = new Array()
var arr_img_names   = new Array()
//存放MethodInfo指针（供动态断点提供更详细的信息）
var arrMethodInfo   = new Array()

//兼容之前的python脚本筛选，同时也是addBreakPoints()所添加的断点的函数也是存放在这里的
var arrayAddr =
[]

var arrayName =
[]

/**
 * --------------------------------------------------------------------------------------------
 * 快捷方法
 * ---------------------
 * i()      list_Images()
 * c()      list_Classes(image,isShowClass) //遍历调用
 * C()      list_Classes(imgOrPtr)          //反射调用
 * m()      list_Methods(klass,isShowMore)
 * f()      find_method(ImageName,ClassName,functionName,ArgsCount,isRealAddr)
 * n()      nopfunction(ptr)
 * d()      Interceptor.detachAll()
 * a()      addBreakPoints(imgOrCls)
 * b()      breakPoint(ptr)
 * P()      printCtx(pointer,range)
 * B()      breakPoints(filter)
 * r()      reflash()
 * p()      print_list_result(filter)
 * --------------------------------------------------------------------------------------------
 * 拓展方法
 * ---------------------
 * HookSetActive()
 * HookOnPointerClick()
 * HookPlayerPrefs()
 * HookDebugLog()
 * HookLoadScene()
 * HookGetSetText()
 * PrintHierarchy()
 * ......  
 * --------------------------------------------------------------------------------------------
 * 其他方法
 * ---------------------
 * getUnityInfo()
 * getApkInfo()
 * GotoScene(str)
 * CallStatic(mPtr,arg0,arg1,arg2,arg3)
 * SeeTypeToString(obj)
 * FuckKnownType(strType,mPtr)
 * Toast(msg)
 * getLibPath()
 * 
 * --- 用作动态Hook去掉指定gameObj
 * setClick()
 * HideClickedObj()
 * HookMotionEvent
 * 
 * --- 查看一些对象
 * showEventData(eventData)
 * showTransform(transform)
 * showEventData(eventData)
 * 
 * --- 修改属性
 * destroyObj(gameObj)
 * setActive(gameObj,visible)
 * SetPosition(mTransform,x,y,z)
 * SetLocalScale(mTransform,x,y,z)
 * SetLocalPosition(mTransform,x,y,z)
 * SetLocalRotation(mTransform,x,y,z,w)
 * ----------------------------------------------------------------------
 * SharedPrefs                                                          |
 * ---------------------------------------------------------------------|
 * SetInt(key,value)    | SetFloat(key,value)   | SetString(key,value)  |
 * GetInt(key)          | GetFloat(key)         | GetString(key)        |
 * ----------------------------------------------------------------------
 * PS:  分清楚何时传的MethodInfo,Transform,GameObject指针 ... 瞎传参数掉用方法必崩
 *      如果使用了gadgat,使用attach方式附加（别使用spawn）
 * --------------------------------------------------------------------------------------------
 */

 //启动的时机，去Hook_dlopen_init中的todo做一些比较早期的处理
setImmediate(Hook_dlopen_init)
function Hook_dlopen_init() {

    soAddr = Module.findBaseAddress(soName)
    if (soAddr != null) return initImages()

    const dlopen_old = Module.findExportByName(null, "dlopen")
    const dlopen_new = Module.findExportByName(null, "android_dlopen_ext")
    // dlopen_new = null
    if (dlopen_old != null) {
        Interceptor.attach(dlopen_old, {
            onEnter: function (args) {
                var l_soName = args[0].readCString()
                if (l_soName.indexOf(soName) != -1) {
                    this.hook = true
                }
            },
            onLeave: function (retval) {
                if (this.hook) {
                    todo()
                }
            }
        })
    }

    if (dlopen_new != null) {
        Interceptor.attach(dlopen_new, {
            onEnter: function (args) {
                var l_soName = args[0].readCString()
                if (l_soName.indexOf(soName) != -1) {
                    this.hook = true
                }
            },
            onLeave: function (retval) {
                if (this.hook) {
                    todo()
                }
            }
        })
    }
    
    //在初始化之后在做其他事情[initImages()之后]
    function todo(){
        //初始化参数
        initImages()
        //detach掉对dlopen的hook
        d()

        //启动的时候断点方法
        //B()

        // setTimeout(HookPlayerPrefs(),2000)
        
    }
}

function initImages(){
    LogFlag = false 
    initFunctions()
    list_Images()
    LogFlag = true

    function initFunctions(){
        //const Il2CppImage* il2cpp_get_corlib()
        il2cpp_get_corlib                       = new NativeFunction(Module.findExportByName(soName,"il2cpp_get_corlib"),'pointer',[])
        //Il2CppDomain* il2cpp_domain_get()
        il2cpp_domain_get                       = new NativeFunction(Module.findExportByName(soName,"il2cpp_domain_get"),'pointer',[])
        //const Il2CppAssembly** il2cpp_domain_get_assemblies(const Il2CppDomain* domain, size_t* size)
        il2cpp_domain_get_assemblies            = new NativeFunction(Module.findExportByName(soName,"il2cpp_domain_get_assemblies"),'pointer',['pointer','pointer'])
        //const Il2CppImage* il2cpp_assembly_get_image(const Il2CppAssembly *assembly)
        il2cpp_assembly_get_image               = new NativeFunction(Module.findExportByName(soName,"il2cpp_assembly_get_image"),'pointer',['pointer'])

        //size_t il2cpp_image_get_class_count(const Il2CppImage * image)
        il2cpp_image_get_class_count            = new NativeFunction(Module.findExportByName(soName,"il2cpp_image_get_class_count"),'pointer',['pointer'])
        //const Il2CppClass* il2cpp_image_get_class(const Il2CppImage * image, size_t index)
        il2cpp_image_get_class                  = new NativeFunction(Module.findExportByName(soName,"il2cpp_image_get_class"),'pointer',['pointer','int'])

        //const MethodInfo* il2cpp_class_get_methods(Il2CppClass *klass, void* *iter)
        il2cpp_class_get_methods                = new NativeFunction(Module.findExportByName(soName,"il2cpp_class_get_methods"),'pointer',["pointer","pointer"])
        //Il2CppClass* il2cpp_class_from_type(const Il2CppType *type)
        il2cpp_class_from_type                  = new NativeFunction(Module.findExportByName(soName,"il2cpp_class_from_type"),'pointer',["pointer"])
        //const Il2CppType* il2cpp_class_get_type(Il2CppClass *klass)
        il2cpp_class_get_type                   = new NativeFunction(Module.findExportByName(soName,"il2cpp_class_get_type"),'pointer',["pointer"])
        //Il2CppClass* il2cpp_class_from_system_type(Il2CppReflectionType *type)
        il2cpp_class_from_system_type           = new NativeFunction(Module.findExportByName(soName,"il2cpp_class_from_system_type"),'pointer',["pointer"])
        //Il2CppClass* il2cpp_class_from_name(const Il2CppImage* image, const char* namespaze, const char *name)
        il2cpp_class_from_name                  = new NativeFunction(Module.findExportByName(soName,"il2cpp_class_from_name"),'pointer',["pointer","pointer","pointer"])
        //const MethodInfo* il2cpp_class_get_method_from_name(Il2CppClass *klass, const char* name, int argsCount)
        il2cpp_class_get_method_from_name       = new NativeFunction(Module.findExportByName(soName,"il2cpp_class_get_method_from_name"),'pointer',["pointer","pointer","int"])

        //Il2CppString* il2cpp_string_new(const char* str)
        il2cpp_string_new                       = new NativeFunction(Module.findExportByName(soName,"il2cpp_string_new"),'pointer',["pointer"])
        //char* il2cpp_type_get_name(const Il2CppType *type)
        il2cpp_type_get_name                    = new NativeFunction(Module.findExportByName(soName,"il2cpp_type_get_name"),'pointer',["pointer"])
        //Il2CppClass* il2cpp_type_get_class_or_element_class(const Il2CppType *type)
        il2cpp_type_get_class_or_element_class  = new NativeFunction(Module.findExportByName(soName,"il2cpp_type_get_class_or_element_class"),'pointer',["pointer"])
    }
}

function i(){
    list_Images()
}

function c(image,isShowClass){
    list_Classes(image,isShowClass)
}

function m(klass){
    list_Methods(klass,true)
}

/**
 * 参数可以传递 绝对地址 相对地址 methodinfo指针（解析参数）
 * @param {Number} m_ptr 
 */
function b(m_ptr){
    breakPoint(m_ptr)
}

/**
 * nop 指定函数 (相对地址/绝对地址都可以填)
 * @param {Number} m_ptr 
 */
function n(m_ptr){
    var src_ptr = m_ptr
    m_ptr = Number(m_ptr) < Number(soAddr) ? soAddr.add(ptr(m_ptr)) :ptr(m_ptr)
    //原函数的引用也可以再replace中调用
    // var srcFunc = new NativeFunction(m_ptr,'void',['pointer','pointer','pointer','pointer'])
    Interceptor.replace(m_ptr,new NativeCallback(function(arg0,arg1,arg2,arg3){
        LOG("\nCalled NOP function ---> "+m_ptr+" ("+src_ptr+")",LogColor.YELLOW)
        // srcFunc(arg0,arg1,arg2,arg3)
    },'void',['pointer','pointer','pointer','pointer']))
}

function d(){
    Interceptor.detachAll()
}

/**
 * 查找 Method 地址
 * @param {String} ImageName 
 * @param {String} ClassName 
 * @param {String} functionName 
 * @param {Number} ArgsCount 
 */
function f(ImageName,ClassName,functionName,ArgsCount){
    find_method(ImageName,ClassName,functionName,ArgsCount,false)
}

/**
 * 用来查看地址 确定不是单独的一条B，以便于InlineHook的后续处理
 * @param {Number} m_ptr 绝对地址相对地址都可以
 * @param {Number} 打印指令条数
 */
function P(m_ptr,range){
    m_ptr = Number(m_ptr) < Number(soAddr) ? soAddr.add(ptr(m_ptr)) :ptr(m_ptr)
    printCtx(m_ptr,(range==undefined?20:range),"")
}

//默认就用Assembly-CSharp，用的最多
function a(imgOrCls){
    if (imgOrCls == undefined) {
        for (var i = 0 ;i< arr_img_names.length;i++){
            if ( arr_img_names[i] == 'Assembly-CSharp'){
                imgOrCls = arr_img_addr[i]
                break
            }
        }
    }
    addBreakPoints(imgOrCls)
}

function B(filter,isAnalyticParameter){
    if (arrayAddr.length == 0) a()
    //默认不要详细参数，都显示可能导致卡顿而且太乱了，建议再需要的时候新开cmd再使用b去指定某个method
    breakPoints(filter,isAnalyticParameter == undefined ? false : isAnalyticParameter)
}

/**
 * 使用反射来查找class
 */
function C(ImgOrPtr){

    var corlib = il2cpp_get_corlib()
    var assemblyClass = il2cpp_class_from_name(corlib, allcStr("System.Reflection"), allcStr("Assembly"))
    var assemblyLoad  = il2cpp_class_get_method_from_name(assemblyClass,allcStr("Load"), 1)
    var assemblyGetTypes = il2cpp_class_get_method_from_name(assemblyClass, allcStr("GetTypes"), 0)

    //public static Assembly Load(string assemblyString)
    var func_load = new NativeFunction(assemblyLoad.readPointer(),'pointer',['pointer','pointer'])
    // var func_load = new NativeFunction(assemblyLoad.readPointer(),'pointer',['pointer','pointer','pointer'])
    
    //public virtual Type[] GetTypes();
    var func_getTypes = new NativeFunction(assemblyGetTypes.readPointer(),'pointer',['pointer','pointer'])

    LOG(getLine(85),LogColor.C33)
    arr_img_names
    .filter(function(name,index){
        if (ImgOrPtr != undefined && Number(arr_img_addr[index]) == Number(ImgOrPtr)) return name
        if (ImgOrPtr != undefined && name.indexOf(ImgOrPtr)!=-1) return name
        // return name
    }).forEach(function(name,index){
        var logstr = "------------ "+name+" ------------"
        var logstrSub = ""
        LOG(logstr,LogColor.C33)
        for (var i= 0;i<logstr.length;i++) {logstrSub += "-"}
        LOG(logstrSub,LogColor.C33)
        var reflectionAssembly = func_load(allcStr(name,""),ptr(0x0))
        // var reflectionAssembly = func_load(ptr(0x0)，allcStr(a_img_names[1],""),ptr(0x0))
        var reflectionTypes = func_getTypes(reflectionAssembly,ptr(0x0))
        
        var items = reflectionTypes.add(p_size*4)
        var length = reflectionTypes.add(p_size*3).readPointer().toInt32()
        for (var i =0 ;i<length;i++){
            var klass = il2cpp_class_from_system_type(items.add(i*p_size).readPointer())
            // LOG("[*] "+klass+"\t"+getClassName(klass),LogColor.C36)
            var type = il2cpp_class_get_type(klass)
            var t_name = il2cpp_type_get_name(type)
            var p_klass = il2cpp_type_get_class_or_element_class(type)
            LOG("[*] "+p_klass+"\t"+t_name.readCString(),LogColor.C36)
        }
    })
    LOG(getLine(85),LogColor.C33)
}

/**
 * 清空缓存
 */
function r(){
    reflash()
}

function p(filter){
    print_list_result(filter)
}

/**
 * -------------------------------------------基础方法-------------------------------------------------
 */

function list_Images(){
    arr_img_names.splice(0,arr_img_names.length)
    arr_img_addr.splice(0,arr_img_addr.length)

    var domain = il2cpp_domain_get()
    var size_t = Memory.alloc(p_size)
    var assemblies = il2cpp_domain_get_assemblies(domain, size_t)
    var count_assemblies = 0
    LOG(getLine(85),LogColor.C33)
    var assemblies_count = size_t.readInt()
    for (var i=0;i<assemblies_count;i++){
        var img_addr = il2cpp_assembly_get_image(assemblies.add(p_size*i)).readPointer()
        var img_name = img_addr.add(p_size).readPointer().readCString()
        var cls_count = il2cpp_image_get_class_count(img_addr).toInt32()
        LOG("[*] "+img_addr+"\t"+cls_count+"\t"+img_name,LogColor.C36)
        arr_img_names.push(img_name)
        arr_img_addr.push(img_addr)
        count_assemblies++
    }    
    LOG(getLine(28),LogColor.C33)
    LOG("  List "+count_assemblies+" Images",LogColor.RED)
    LOG(getLine(85),LogColor.C33)
}

function list_Classes(image,isShowClass){
    if (isShowClass == undefined) isShowClass = true
    var image = ptr(image)
    var cls_count = il2cpp_image_get_class_count(image).toInt32()
    var a_Namespaces = new Array()
    var t_Namespaces = new Array()
    var t_Names = new Array()
    var t_il2CppClass = new Array()
    LOG(getLine(85),LogColor.C33)
    for(var j=0;j<cls_count;j++){
        var il2CppClass = il2cpp_image_get_class(image,j)
        var name = il2CppClass.add(2*p_size).readPointer().readCString()
        var nameSpace = il2CppClass.add(3*p_size).readPointer().readCString()
        if (a_Namespaces.indexOf(nameSpace)==-1) a_Namespaces.push(nameSpace)
        t_il2CppClass.push(il2CppClass)
        t_Names.push(name)
        t_Namespaces.push(nameSpace)
    }
    for(var i=0;i<a_Namespaces.length;i++){
        LOG((i==0?"":(isShowClass?"\n":""))+"[*] "+a_Namespaces[i],LogColor.C36)
        if (!isShowClass) continue
        for (var j=0;j<t_Names.length;j++){
            if(t_Namespaces[j]==a_Namespaces[i]) LOG("\t[-] "+t_il2CppClass[j]+"\t"+t_Names[j],LogColor.C36)
        }
    }    
    var tmp = new Array()
    t_Namespaces.forEach(function(value){
        if (tmp.indexOf(value) == -1) tmp.push(value)
    })
    LOG(getLine(28),LogColor.C33)
    LOG("  List "+cls_count+" Classes | Group by "+tmp.length+" NameSpaces",LogColor.RED)
    LOG(getLine(85),LogColor.C33)
}

function list_Methods(klass,isShowMore){

    if (isShowMore == undefined) isShowMore = false

    klass = ptr(klass)
    var iter = Memory.alloc(p_size)
    var method = NULL
    var count_methods = 0
    LOG(getLine(85),LogColor.C33)
    try{
        while (method = il2cpp_class_get_methods(klass, iter)) {
            var methodName = getMethodName(method)
            var retClass = il2cpp_class_from_type(getMethodReturnType(method))
            var retName = getClassName(retClass)
            var parameters_count = getMethodParametersCount(method)
            //解析参数
            var arr_args = new Array()
            var arr_args_type_addr = new Array()
            for(var i=0;i<parameters_count;i++){
                try{
                    var ParameterInfo = method.add(p_size*5).readPointer()
                    var Il2CppType = ParameterInfo.add(p_size*i*4)
                    var typeClass = il2cpp_class_from_type(getParameterType(Il2CppType))
                    var TypeName = getClassName(typeClass)
                    arr_args.push(TypeName+" "+getParameterName(ParameterInfo))
                    arr_args_type_addr.push(TypeName+" "+typeClass)
                }catch(e){}
            }

            LOG((count_methods==0?"":"\n")+"[*] "+method+" ---> "
                + method.readPointer()+" ---> "+method.readPointer().sub(soAddr)+"\t"
                + (!isShowMore?(parameters_count+"\t"):"") + "\n\t"
                + get_method_modifier(method)
                + retName + " "
                + methodName + " "
                + "(" + arr_args+")"+"\t",LogColor.C36)
                
            count_methods ++

            if (!isShowMore) continue

            LOG("\t\t---> ret\t" + retName +"\t"+retClass,LogColor.C90)
            LOG("\t\t---> cls\t" + arr_args_type_addr,LogColor.C90)
        }
    }catch(e){
        // LOG(e)
    }
    LOG(getLine(85),LogColor.C33)
}

/**
 *  根据 ImageName , ClassName , functionName , argsCount 找到对应 function 的地址
 *  最后一个参数 isRealAddr 用作显示静态分析地址还是当前内存地址（带这个参数则只返回地址，不带则列表信息）
 *  find_method("UnityEngine.UI","Text","get_text",0)
 * @param {String} imageName 
 * @param {String} className 
 * @param {String} functionName 
 * @param {Number} argsCount 
 * @param {Boolean} isRealAddr 
 */
function find_method(imageName,className,functionName,argsCount,isRealAddr){

    // var corlib = il2cpp_get_corlib()
    if (isRealAddr == undefined) isRealAddr = true
    var currentlib = 0
    arr_img_names.forEach(function(name,index){
        if (name == imageName){
            currentlib = arr_img_addr[index]
        }
    })
    var klass = il2cpp_class_from_name(currentlib, Memory.allocUtf8String(imageName), Memory.allocUtf8String(className))
    if (klass == 0){
        for(var j=0;j<il2cpp_image_get_class_count(currentlib).toInt32();j++){
            var il2CppClass = il2cpp_image_get_class(currentlib,j)
            if (getClassName(il2CppClass) == className) {
                klass = il2CppClass
                break
            }
        }
    }
    
    if (klass == 0 ) return ptr(0)
    var method = il2cpp_class_get_method_from_name(klass, allcStr(functionName), argsCount)
    if (method == 0) return ptr(0)
    if (isRealAddr) return isRealAddr ? method.readPointer():method.readPointer().sub(soAddr)

    var parameters_count = getMethodParametersCount(method)
    var arr_args = new Array()
    var arr_args_type_addr = new Array()
    for(var i=0;i<parameters_count;i++){
        var ParameterInfo = method.add(p_size*5).readPointer().add(p_size*i*4)
        var typeClass = il2cpp_class_from_type(getParameterType(ParameterInfo))
        var TypeName = getClassName(typeClass)
        arr_args.push(TypeName+" "+getParameterName(ParameterInfo))
        arr_args_type_addr.push(TypeName+" "+typeClass)
    }
    var disStr = get_method_modifier(method)
                + getClassName(il2cpp_class_from_type(getMethodReturnType(method))) + " "
                + getMethodName(method) + " "
                + "(" + arr_args+")"+"\t"
    LOG(getLine(85),LogColor.C33)
    LOG(imageName+"."+className+"\t"+disStr,LogColor.RED)
    LOG("----------------------------",LogColor.C33)
    var ShowMore = false
    LOG("Il2CppImage\t---->\t"+currentlib +(ShowMore?" ("+ currentlib.add(p_size).readPointer().readCString()+")":""))
    LOG("Il2CppClass\t---->\t"+klass +(ShowMore?" ("+ getClassName(klass)+")":""))
    LOG("MethodInfo\t---->\t"+method +(ShowMore?" ("+ getMethodName(method)+")":""))
    LOG("methodPointer\t---->\t"+method.readPointer() +"\t===>\t"+method.readPointer().sub(soAddr),LogColor.C36)
    LOG(getLine(85),LogColor.C33)
}

function addBreakPoints(imgOrCls){
    imgOrCls = ptr(imgOrCls)
    var method_count = 0
    var count = 0
    try{
        count = il2cpp_image_get_class_count(imgOrCls).toInt32()
    }catch(e){
        LOG("Error imgOrCls ",LogColor.RED)
        return
    }
    //判断是image还是class
    LOG(getLine(85),LogColor.C33)
    if (String(arr_img_addr).indexOf(imgOrCls)!=-1){
        for(var j=0;j<count;j++){
            var il2CppClass = il2cpp_image_get_class(imgOrCls,j)
            addFunctions(il2CppClass)
        }
    }else{
        addFunctions(imgOrCls)
    }
    
    LOG("------------------------------------------",LogColor.C33)
    LOG("  Added "+method_count+" Methods    |    All "+arrayAddr.length,LogColor.RED)
    LOG(getLine(85),LogColor.C33)

    function addFunctions(cls){
        var iter = Memory.alloc(p_size)
        var method = NULL
            try{
                while (method = il2cpp_class_get_methods(cls, iter)) {
                    if (Number(method) == 0) break
                    var methodName = get_method_des(method)
                    var methodAddr = method.readPointer()
                    if (methodAddr == 0) continue
                    LOG("[*] "+methodAddr+" ---> "+methodAddr.sub(soAddr)+"\t"+methodName,LogColor.C36)
                    if (arrayName.indexOf(methodName)!=-1) continue
                    arrayName.push(methodName)
                    arrayAddr.push(methodAddr.sub(soAddr))
                    arrMethodInfo.push(method)
                    method_count ++ 
                }
            }catch(e){
                // LOG(e)
            }
    }
}

/**
 * 解析函数的参数信息
 * @param {Number} method MethodInfo指针
 * @param {*} isArray 内部函数调用 b()
 */
function get_method_des(method,isArray){
    method = ptr(method)
    var methodName = getMethodName(method)
    var retClass = il2cpp_class_from_type(getMethodReturnType(method))
    var retName = getClassName(retClass)
    var parameters_count = getMethodParametersCount(method)
    var permission = get_method_modifier(method)
    
    //解析参数
    var arr_args = new Array()
    var arr_args_t = new Array()
    var arr_args_n = new Array()
    for(var i=0;i<parameters_count;i++){
        var ParameterInfo = method.add(p_size*5).readPointer().add(p_size*i*4)
        var typeClass = il2cpp_class_from_type(getParameterType(ParameterInfo))
        var TypeName = getClassName(typeClass)
        var paraName = getParameterName(ParameterInfo)
        arr_args.push(TypeName+" "+paraName)
        arr_args_t.push(typeClass)
        arr_args_n.push(paraName)
    }

    //补空格对齐
    var maxlength = 0
    for(var i=0;i<arr_args_n.length;i++){
        maxlength = maxlength > arr_args_n[i].length ? maxlength : arr_args_n[i].length
    }
    for(var i=0;i<arr_args_n.length;i++){
        arr_args_n[i] += getSpace(maxlength - arr_args_n[i].length)
    }

    var ret_str = permission+retName+" "+methodName+ " ("+arr_args+")"

    if (isArray==undefined?false:true){
        var a_ret = new Array()
        a_ret.push(ret_str)             //字符串简述
        a_ret.push(retClass)            //返回值类型
        a_ret.push(parameters_count)    //参数个数
        a_ret.push(arr_args_t)          //参数class列表
        a_ret.push(arr_args_n)          //参数名称
        a_ret.push(getSpace(maxlength))           //参数最大长度（补齐）
        // LOG(JSON.stringify(a_ret))
        return a_ret
    }

    return ret_str

    function getSpace(length){
        var retStr = ""
        for (var i = 0;i<length;i++){
            retStr += " "
        }
        return retStr
    }
}

/**
 * 断点单个函数
 * @param {Number} m_ptr 可以是绝对地址 相对地址 MethodInfo地址
 * @param {Number} index 
 * @param {String} name 
 */
function breakPoint(m_ptr,index,name){
    var arr_method_info = NULL
    try{
        arr_method_info = get_method_des(m_ptr,true)
    }catch(e){
        m_ptr = Number(m_ptr) < Number(soAddr) ? soAddr.add(ptr(m_ptr)) :ptr(m_ptr)
        Interceptor.attach(m_ptr,{
            onEnter:function(args){
                
            },
            onLeave:function(ret){
                // if(index!=undefined && ++count_method_times[index] > maxCallTime) return
                LOG("\n[*] called : "+m_ptr.sub(soAddr)+" ("+arrMethodInfo[index]+")"+"\t--->\t"+name +"  ret ---> "+ret,LogColor.C36)
            } 
        })
        return
    }
    var method_addr = ptr(m_ptr).readPointer()
    // LOG(method_addr.sub(soAddr))
    Interceptor.attach(method_addr,{
        onEnter:function(args){
            // if(index!=undefined && ++count_method_times[index] > maxCallTime) return
            LOG("\n-----------------------------------------------------------",LogColor.C33)
            var funcName = arr_method_info[0]
            LOG("Called "+funcName,LogColor.C96)
            LOG("----------------------",LogColor.C33)
            for(var i=0;i<arr_method_info[2];i++){
                var typeCls = arr_method_info[3][i]
                var strType = getClassName(typeCls)
                //静态方法没有上下文，反之有则arg+1
                var ClsArg = args[(funcName.indexOf("static")==-1?i+1:i)]
                var result = FuckKnownType(strType,ClsArg)
                LOG("  arg"+i+" | "+arr_method_info[4][i]+"\t--->\t"+ ClsArg +"\t"+ 
                    ((String(ClsArg).length)<4?"\t":"")+
                    strType+" ("+typeCls+")"+"\t"+result,LogColor.C36)
            }
        },
        onLeave:function(ret){
            // if(index!=undefined && count_method_times[index] > maxCallTime) return
            var strType = getClassName(arr_method_info[1])
            var result = FuckKnownType(strType,ret)
            var methodStr = arr_method_info.length == 0 ? "" : " ("+arr_method_info[1]+")"
            LOG("  ret  |"+arr_method_info[5]+"\t--->\t"+ret +
                (String(ret).length<4?"\t":"")+"\t"+ 
                strType  + methodStr + "\t" +
                result,LogColor.C36)
            LOG("-----------------------------------------------------------",LogColor.C33)
        }
    })
}

/**
 * 使用arrayName 和 arrayAddr 断点多个函数 （动态添加的时候使用到arrMethodInfo）
 * @param {String} filter 查询筛选
 * @param {Boolean} isAnalyticParameter 是否解析参数
 */
function breakPoints(filter,isAnalyticParameter){
    // Interceptor.detachAll()
    var t_arrayName = new Array()
    var t_arrayAddr = new Array()
    var t_arrayMethod = new Array()
    if (filter == undefined || filter == ""){
        t_arrayName = arrayName
        t_arrayAddr = arrayAddr
        t_arrayMethod = arrMethodInfo
    }else{
        arrayName.forEach(function(value,index){
            if (value.indexOf(filter)!=-1){
                t_arrayName.push(value)
                t_arrayAddr.push(arrayAddr[index])
                t_arrayMethod.push(arrMethodInfo[index])
            }
        })
    }

    count_method_times = new Array(t_arrayName.length)
    for(var t =0;t<t_arrayAddr.length;t++){
        count_method_times[t] = Number(1)
    }

    t_arrayAddr
        .map(function(temp){return soAddr.add(temp)})
        .forEach(function(value,index){
            LOG("-------------------------",LogColor.C90)
            LOG('currentAddr:' + value + "\t"+t_arrayName[index],LogColor.C32)
            // var a1 = isAnalyticParameter ? arrayMethod[index] : value
            // var a2 = isAnalyticParameter ? undefined : index
            try{
                funcTmp(value,index,t_arrayName)
                // breakPoint(a1,a2,t_arrayName[index])
            }catch(e){
                funcTmp(value.add(1),index,t_arrayName)
                // breakPoint(a1.add(1),a2,t_arrayName[index])
            }            
            LOG("\t\t---->"+index+"\t"+value.sub(soAddr)+" is prepared ",LogColor.C33)
        })
    LOG("------------------------------------------",LogColor.C33)
    LOG("  Added "+t_arrayAddr.length+" BreakPoints    |    All "+arrayAddr.length,LogColor.RED)
    LOG("-------------------------------------------------------------------------------------",LogColor.C33)

    function funcTmp(currentAddr,index,arrayName){
        try{
            Interceptor.attach(currentAddr, {
                onEnter: function(args){
                    if(++count_method_times[index] < maxCallTime){
                        var strMethodP = t_arrayMethod.length == 0 ? "" : " ("+t_arrayMethod[index]+")"
                        LOG("called : "+currentAddr.sub(soAddr)+strMethodP+"\t--->\t"+arrayName[index] +"\n",LogColor.C36)
                    }
                },
                onLeave: function(retval){
    
                }
            })
        }catch(e){
            LOG(e,LogColor.C91)
        }
    }
}

/**
 * 有时候方法太多遍历一遍太费时间，就需要手动调用该方法把打印出来的值替换开始处的值（arrayAddr/arrayName）
 */
function print_list_result(filter){
    if (arrayAddr == null || arrayAddr.length ==0) return
    if (filter == undefined){
        LOG("\n-------------- list result --------------",LogColor.C36)
        LOG("\nvar arrayAddr = \n"+JSON.stringify(arrayAddr))
        LOG("\nvar arrayName = \n"+JSON.stringify(arrayName)+"\n")
        LOG("\nCOUNT:"+arrayAddr.length+"\n-----------------------------------------",LogColor.C36)
    }else{
        LOG("\n---- list result by Search '"+filter+"' ----",LogColor.C36)
        var temp_names = new Array()
        var temp_addrs = new Array()
        arrayName.forEach(function(value,index){
            if (value.indexOf(filter)!=-1){
                temp_names.push(value)
                temp_addrs.push(arrayAddr[index])
            }
        })
        LOG("\nvar arrayAddr = \n"+JSON.stringify(temp_addrs))
        LOG("\nvar arrayName = \n"+JSON.stringify(temp_names)+"\n")
        LOG("\nCOUNT:"+temp_addrs.length+"\n-----------------------------------------",LogColor.C36)
    }
}

/**
 * 显示哪些因为超出了最大调用次数的函数地址名称以及index
 */
function print_deserted_methods(){
    if (count_method_times == null || count_method_times.length == 0) return
    LOG("------------------deserted methods------------------\n",LogColor.C92)
    count_method_times.forEach(function(value,index){
        if (Number(value)>maxCallTime) LOG("[*] "+arrayAddr[index].add(soAddr)+"\t"+arrayAddr[index]+"\t"+arrMethodInfo[index]+"\t("+index+")"+"\t--->\t"+arrayName[index]+"\n",LogColor.C32)
    })
}

/**
 *  用来区分transform和gameObj
 * @param {Object} obj 
 */
function SeeTypeToString(obj,b){
    var s_type   = new NativeFunction(find_method("UnityEngine.CoreModule","Object","ToString",0,true),'pointer',['pointer'])(ptr(obj))
    if (b == undefined) {
        LOG(readU16(s_type))
    }else{
        return readU16(s_type)
    }

}

/**
 * 将mPtr指向的位置以 strType 类型解析并返回 String 
 * 拓展解析一些常用的类，用b断某个方法的时候就可以很方便的打印出参数
 * @param {String} strType 
 * @param {Number} mPtr 
 * @returns {String}
 */
function FuckKnownType(strType,mPtr){
    try{
        switch(strType){
            case "Void"         : 
            case "Object[]"     : return ""
            case "String"       : return mPtr == 0 ? "" : readU16(mPtr)
            case "Boolean"      : return (mPtr.toInt32() == 1) ? "True" : "False"
            case "Int32"        : return mPtr.toInt32()
            case "Single"       : return mPtr.readFloat()
            case "Object"       : 
            case "GameObject"   : return SeeTypeToString(mPtr,false)
            case "Texture"      : 
                var w = new NativeFunction(find_method("UnityEngine.CoreModule","Texture","GetDataWidth",0),'int',['pointer'])(mPtr)
                var h = new NativeFunction(find_method("UnityEngine.CoreModule","Texture","GetDataHeight",0),'int',['pointer'])(mPtr)
                var r = new NativeFunction(find_method("UnityEngine.CoreModule","Texture","get_isReadable",0),'int',['pointer'])(mPtr)
                var m = new NativeFunction(find_method("UnityEngine.CoreModule","Texture","get_wrapMode",0),'int',['pointer'])(mPtr)
                r = r == 0 ? "False":"True"
                m = m == 0 ? "Repeat" : (m == 1 ? "Clamp" : (m == 2 ? "Mirror":"MirrorOnce"))
                return JSON.stringify([m,w,h,r])
            case "RectTransform":
                // var pivot = new NativeFunction(find_method("UnityEngine.CoreModule","RectTransform","get_pivot",0),'pointer',['pointer'])(mPtr)
                // var rect = new NativeFunction(find_method("UnityEngine.CoreModule","RectTransform","get_sizeDelta",0),'pointer',['pointer'])(mPtr)
                // var str1 = FuckKnownType("Vector2",pivot)
                // var str2 = FuckKnownType("Rect",rect)
                return ""
            case "Text"         : return readU16(new NativeFunction(find_method("UnityEngine.UI","Text","get_text",0),'pointer',['pointer'])(mPtr))
            case "Vector2"      : return readU16(new NativeFunction(find_method("UnityEngine.CoreModule","Vector2","ToString",0),'pointer',['pointer'])(mPtr))
            case "Vector3"      : return readU16(new NativeFunction(find_method("UnityEngine.CoreModule","Vector3","ToString",0),'pointer',['pointer'])(mPtr))
            case "Vector4"      : return readU16(new NativeFunction(find_method("UnityEngine.CoreModule","Vector4","ToString",0),'pointer',['pointer'])(mPtr))
            case "Color"        : return readU16(new NativeFunction(find_method("UnityEngine.CoreModule","Color","ToString",0),'pointer',['pointer'])(mPtr))
            case "Color32"      : return readU16(new NativeFunction(find_method("UnityEngine.CoreModule","Color32","ToString",0),'pointer',['pointer'])(mPtr))
            case "Event"        : return readU16(new NativeFunction(find_method("UnityEngine.IMGUIModule","Event","ToString",0),'pointer',['pointer'])(mPtr))
            case "Bounds"       : return readU16(new NativeFunction(find_method("UnityEngine.CoreModule","Bounds","ToString",0),'pointer',['pointer'])(mPtr))
            case "TextAsset"    : return readU16(new NativeFunction(find_method("UnityEngine.CoreModule","TextAsset","ToString",0),'pointer',['pointer'])(mPtr))
            case "Rect"         : return readU16(new NativeFunction(find_method("UnityEngine.CoreModule","Rect","ToString",0),'pointer',['pointer'])(mPtr))
            case "Ray"          : return readU16(new NativeFunction(find_method("UnityEngine.CoreModule","Ray","ToString",0),'pointer',['pointer'])(mPtr))
            case "Quaternion"   : return readU16(new NativeFunction(find_method("UnityEngine.CoreModule","Quaternion","ToString",0),'pointer',['pointer'])(mPtr))
            case "Pose"         : return readU16(new NativeFunction(find_method("UnityEngine.CoreModule","Pose","ToString",0),'pointer',['pointer'])(mPtr))
            case "Plane"        : return readU16(new NativeFunction(find_method("UnityEngine.CoreModule","Plane","ToString",0),'pointer',['pointer'])(mPtr))
            default : return "UnKnown"
        }
    }catch(e){
        // LOG(e)
        return "Error"
    }
}

function reflash(){
    arrMethodInfo.splice(0,arrMethodInfo.length)
    arrayAddr.splice(0,arrayAddr.length)
    arrayName.splice(0,arrayName.length)
}

/**
 * 解析 Method 的权限符
 * @param {Number} method_ptr 
 */
function get_method_modifier(method_ptr){
    
    var flags = ptr(method_ptr).add(p_size*8+4).readU16()
    var access = flags & il2cppTabledefs.METHOD_ATTRIBUTE_MEMBER_ACCESS_MASK
    var ret_str = ""
    switch(access){
        case il2cppTabledefs.METHOD_ATTRIBUTE_PRIVATE:
            ret_str += "private " ; break
        case il2cppTabledefs.METHOD_ATTRIBUTE_PUBLIC:
            ret_str +=  "public " ; break
        case il2cppTabledefs.METHOD_ATTRIBUTE_FAMILY:
            ret_str +=  "protected " ; break
        case il2cppTabledefs.METHOD_ATTRIBUTE_ASSEM:
        case il2cppTabledefs.METHOD_ATTRIBUTE_FAM_AND_ASSEM:
            ret_str +=  "internal " ; break
        case il2cppTabledefs.METHOD_ATTRIBUTE_FAM_OR_ASSEM:
            ret_str +=  "protected internal " ; break
    }

    if (flags & il2cppTabledefs.METHOD_ATTRIBUTE_STATIC) {
        ret_str += "static "
    }

    if (flags & il2cppTabledefs.METHOD_ATTRIBUTE_ABSTRACT) {
        ret_str += "abstract "
        if ((flags & il2cppTabledefs.METHOD_ATTRIBUTE_VTABLE_LAYOUT_MASK) == il2cppTabledefs.METHOD_ATTRIBUTE_REUSE_SLOT) {
            ret_str += "override "
        }
    } else if (flags & il2cppTabledefs.METHOD_ATTRIBUTE_FINAL) {
        if ((flags & il2cppTabledefs.METHOD_ATTRIBUTE_VTABLE_LAYOUT_MASK) == il2cppTabledefs.METHOD_ATTRIBUTE_REUSE_SLOT) {
            ret_str += "sealed override "
        }
    } else if (flags & il2cppTabledefs.METHOD_ATTRIBUTE_VIRTUAL) {
        if ((flags & il2cppTabledefs.METHOD_ATTRIBUTE_VTABLE_LAYOUT_MASK) == il2cppTabledefs.METHOD_ATTRIBUTE_NEW_SLOT) {
            ret_str += "virtual "
        } else {
            ret_str += "override "
        }
    }
    if (flags & il2cppTabledefs.METHOD_ATTRIBUTE_PINVOKE_IMPL) {
        ret_str += "extern "
    }
    
    return ret_str
}

function printLogColors(){
    var str = "123456789"
    console.log("----------------  listLogColors  ----------------")
    for (var i = 30 ;i<= 37 ;i++){
        console.log("\t\t\x1b["+i+"m"+i+"\t"+str+"\x1b[0m")
    }
    console.log("----------------------------------------------")
    for (var i = 40 ;i<= 47 ;i++){
        console.log("\t\t\x1b["+i+"m"+i+"\t"+str+"\x1b[0m")
    }
    console.log("----------------------------------------------")
    for (var i = 90 ;i<= 97 ;i++){
        console.log("\t\t\x1b["+i+"m"+i+"\t"+str+"\x1b[0m")
    }
    console.log("----------------------------------------------")
    for (var i = 100 ;i<= 107 ;i++){
        console.log("\t\t\x1b["+i+"m"+i+"\t"+str+"\x1b[0m")
    }
    console.log("----------------------------------------------")
}

var il2cppTabledefs = {
    METHOD_ATTRIBUTE_MEMBER_ACCESS_MASK         : 0x0007,
    METHOD_ATTRIBUTE_COMPILER_CONTROLLED        : 0x0000,
    METHOD_ATTRIBUTE_PRIVATE                    : 0x0001,
    METHOD_ATTRIBUTE_FAM_AND_ASSEM              : 0x0002,
    METHOD_ATTRIBUTE_ASSEM                      : 0x0003,
    METHOD_ATTRIBUTE_FAMILY                     : 0x0004,
    METHOD_ATTRIBUTE_FAM_OR_ASSEM               : 0x0005,
    METHOD_ATTRIBUTE_PUBLIC                     : 0x0006,

    METHOD_ATTRIBUTE_STATIC                     : 0x0010,
    METHOD_ATTRIBUTE_FINAL                      : 0x0020,
    METHOD_ATTRIBUTE_VIRTUAL                    : 0x0040,
    METHOD_ATTRIBUTE_ABSTRACT                   : 0x0400,
    METHOD_ATTRIBUTE_PINVOKE_IMPL               : 0x2000,
    METHOD_ATTRIBUTE_VTABLE_LAYOUT_MASK         : 0x0100,

    METHOD_ATTRIBUTE_REUSE_SLOT                 : 0x0000,
    METHOD_ATTRIBUTE_NEW_SLOT                   : 0x0100,
    METHOD_ATTRIBUTE_PINVOKE_IMPL               : 0x2000,
}

var LogColor = {
    WHITE:0,RED:1,YELLOW:3,
    C31:31,C32:32,C33:33,C34:34,C35:35,C36:36,
    C41:41,C42:42,C43:43,C44:44,C45:45,C46:46,
    C90:90,C91:91,C92:92,C93:93,C94:94,C95:95,C96:96,C97:97,
    C100:100,C101:101,C102:102,C103:103,C104:104,C105:105,C106:106,C107:107
}
 
function getClassName(klass){
    return ptr(klass).add(p_size*2).readPointer().readCString()
}

function getMethodName(method){
    return ptr(method).add(p_size*2).readPointer().readCString()
}

function getMethodParametersCount(method){
    return ptr(method).add(p_size*8+4+2+2+2).readU8()
}

function getMethodParameters(method){
    return ptr(method).add(p_size*5).readPointer()
}

function getMethodReturnType(method){
    return ptr(method).add(p_size*4).readPointer()
}

function getParameterName(ParameterInfo){
    return ptr(ParameterInfo).readPointer().readCString()
}

function getParameterType(Il2CppType){
    return ptr(Il2CppType).add(4*2+p_size).readPointer()
}

/**
 * -------------------------------------------其他方法-------------------------------------------------
 */

/**
 * 修改函数返回值为true
 * @param {Int} mPtr 函数地址
 * @param {Boolean} boolean 返回值修改为True/False
 */
function ChangeRet(mPtr,boolean){
    Interceptor.attach(soAddr.add(mPtr),{
        onEnter:function(args){

        },
        onLeave:function(ret){
            ret.replace(ptr(boolean == true ? 0x1:0x0))
            LOG("\nCalled mPtr = "+mPtr +"\tret = "+ret,LogColor.C36)
        }
    })
}

function getUnityInfo(){

    var line20 = getLine(20)

    Application()
    SystemInfo()
    Time()

    function Time(){

        console.error("------------------- TIME -------------------")
    
        //public static extern float get_time()
        var addr_get_time = find_method("UnityEngine.CoreModule","Time","get_time",0,true)
        if (addr_get_time != 0)
            LOG("[*] get_time \t\t\t: "+new NativeFunction(addr_get_time,'float',[])()+"\n"+line20,LogColor.C36)
    
        //public static extern float deltaTime()
        var addr_deltaTime = find_method("UnityEngine.CoreModule","Time","deltaTime",0,true)
        if (addr_deltaTime != 0)
            LOG("[*] deltaTime \t\t\t: "+new NativeFunction(addr_deltaTime,'float',[])()+"\n"+line20,LogColor.C36)
    
        //public static extern float get_fixedDeltaTime()
        var addr_get_fixedDeltaTime = find_method("UnityEngine.CoreModule","Time","get_fixedDeltaTime",0,true)
        if (addr_get_fixedDeltaTime != 0)
            LOG("[*] fixedDeltaTime \t\t: "+new NativeFunction(addr_get_fixedDeltaTime,'float',[])()+"\n"+line20,LogColor.C36)
    
        //public static extern float get_fixedTime()
        var addr_get_fixedTime = find_method("UnityEngine.CoreModule","Time","get_fixedTime",0,true)
        if (addr_get_fixedTime != 0)
            LOG("[*] fixedTime \t\t\t: "+new NativeFunction(addr_get_fixedTime,'float',[])()+"\n"+line20,LogColor.C36)
    
        //public static extern int get_frameCount()
        var addr_get_frameCount = find_method("UnityEngine.CoreModule","Time","get_frameCount",0,true)
        if (addr_get_frameCount != 0)
            LOG("[*] frameCount \t\t\t: "+new NativeFunction(addr_get_frameCount,'int',[])()+"\n"+line20,LogColor.C36)
        
        //public static extern float get_inFixedTimeStep()
        var addr_get_inFixedTimeStep = find_method("UnityEngine.CoreModule","Time","get_inFixedTimeStep",0,true)
        if (addr_get_inFixedTimeStep != 0)
            LOG("[*] inFixedTimeStep \t\t: "+(new NativeFunction(addr_get_inFixedTimeStep,'float',[])()==0?"false":"true")+"\n"+line20,LogColor.C36)
    
        //public static extern float realtimeSinceStartup()
        var addr_realtimeSinceStartup = find_method("UnityEngine.CoreModule","Time","realtimeSinceStartup",0,true)
        if (addr_realtimeSinceStartup != 0)
            LOG("[*] realtimeSinceStartup \t\t: "+new NativeFunction(addr_realtimeSinceStartup,'float',[])()+"\n"+line20,LogColor.C36)
    
        //public static extern float get_renderedFrameCount()
        var addr_get_renderedFrameCount = find_method("UnityEngine.CoreModule","Time","get_renderedFrameCount",0,true)
        if (addr_get_renderedFrameCount != 0)
            LOG("[*] renderedFrameCount \t\t: "+new NativeFunction(addr_get_renderedFrameCount,'float',[])()+"\n"+line20,LogColor.C36)
    
        //public static float smoothDeltaTime()
        var addr_smoothDeltaTime = find_method("UnityEngine.CoreModule","Time","smoothDeltaTime",0,true)
        if (addr_smoothDeltaTime != 0)
            LOG("[*] smoothDeltaTime \t\t: "+new NativeFunction(addr_smoothDeltaTime,'float',[])()+"\n"+line20,LogColor.C36)
    }
    
    function Application(){
        LOG("------------------- Application -------------------",LogColor.RED)
        
        var Addr_cloudProjectId         = find_method("UnityEngine.CoreModule","Application","get_cloudProjectId",0,true)
        var Addr_dataPath               = find_method("UnityEngine.CoreModule","Application","get_dataPath",0,true)
        var Addr_identifier             = find_method("UnityEngine.CoreModule","Application","get_identifier",0,true)
        var Addr_internetReachability   = find_method("UnityEngine.CoreModule","Application","get_internetReachability",0,true)
        var Addr_isMobilePlatform       = find_method("UnityEngine.CoreModule","Application","get_isMobilePlatform",0,true)
        var Addr_isConsolePlatform      = find_method("UnityEngine.CoreModule","Application","get_isConsolePlatform",0,true)
        var Addr_isEditor               = find_method("UnityEngine.CoreModule","Application","get_isEditor",0,true)
        var Addr_productName            = find_method("UnityEngine.CoreModule","Application","get_productName",0,true)
        var Addr_streamingAssetsPath    = find_method("UnityEngine.CoreModule","Application","get_streamingAssetsPath",0,true)
        var Addr_version                = find_method("UnityEngine.CoreModule","Application","get_version",0,true)
        var Addr_unityVersion           = find_method("UnityEngine.CoreModule","Application","get_unityVersion",0,true)
        var Addr_systemLanguage         = find_method("UnityEngine.CoreModule","Application","get_systemLanguage",0,true)
        var Addr_isPlaying              = find_method("UnityEngine.CoreModule","Application","get_isPlaying",0,true)
        var Addr_persistentDataPath     = find_method("UnityEngine.CoreModule","Application","get_persistentDataPath",0,true)
        var Addr_dpi                    = find_method("UnityEngine.CoreModule","Application","get_dpi",0,true)
        var Addr_get_height             = find_method("UnityEngine.CoreModule","Application","get_height",0,true)
        var Addr_get_width              = find_method("UnityEngine.CoreModule","Application","get_width",0,true)
        var Addr_get_orientation        = find_method("UnityEngine.CoreModule","Application","get_orientation",0,true)
    
        //public static string cloudProjectId()
        if (Addr_cloudProjectId != 0)
            LOG("[*] cloudProjectId \t\t: "+ 
            new NativeFunction(Addr_cloudProjectId,'pointer',[])()
            .add(p_size*3).readUtf16String()+"\n"+line20,LogColor.C36)
    
        //public static string get_productName()
        if (Addr_productName != 0)
            LOG("[*] productName \t\t: "+
            new NativeFunction(Addr_productName,'pointer',[])()
            .add(p_size*3).readUtf16String()+"\n"+line20,LogColor.C36)
    
        //public static extern string get_identifier()
        if (Addr_identifier != 0)
            LOG("[*] identifier \t\t\t: "+
            new NativeFunction(Addr_identifier,'pointer',[])()
            .add(p_size*3).readUtf16String()+"\n"+line20,LogColor.C36)
    
        //public static string version()
        if (Addr_version != 0)
            LOG("[*] version \t\t\t: "+ 
            new NativeFunction(Addr_version,'pointer',[])()
            .add(p_size*3).readUtf16String()+"\n"+line20,LogColor.C36)
    
        //public static string unityVersion()
        if (Addr_unityVersion != 0)
            LOG("[*] unityVersion \t\t: "+ 
            new NativeFunction(Addr_unityVersion,'pointer',[])()
            .add(p_size*3).readUtf16String()+"\n"+line20,LogColor.C36)
    
        //public static string dataPath()
        if (Addr_dataPath != 0)
            LOG("[*] dataPath \t\t\t: "+
            new NativeFunction(Addr_dataPath,'pointer',[])()
            .add(p_size*3).readUtf16String()+"\n"+line20,LogColor.C36)
    
        //public static string streamingAssetsPath()
        if (Addr_streamingAssetsPath != 0)
            LOG("[*] streamingAssetsPath \t: "+
            new NativeFunction(Addr_streamingAssetsPath,'pointer',[])()
            .add(p_size*3).readUtf16String()+"\n"+line20,LogColor.C36)
    
        //public static string persistentDataPath
        if (Addr_persistentDataPath !=0)
            LOG("[*] persistentDataPath \t\t: "+
            new NativeFunction(Addr_persistentDataPath,'pointer',[])()
            .add(p_size*3).readUtf16String()+"\n"+line20,LogColor.C36)
    
        //public static NetworkReachability internetReachability()
        if (Addr_internetReachability!=0){
            var value = new NativeFunction(Addr_internetReachability,'int',[])()
            LOG("[*] internetReachability \t: "+
                (value==0?"NotReachable":(value==1?"ReachableViaCarrierDataNetwork":"ReachableViaLocalAreaNetwork"))+"\n"+line20,LogColor.C36)
        }
    
        //public static bool get_isMobilePlatform()
        if (Addr_isMobilePlatform!=0)
            LOG("[*] isMobilePlatform \t\t: "+
            (new NativeFunction(Addr_isMobilePlatform,'bool',[])()==1?"true":"false")+"\n"+line20,LogColor.C36)
    
        //public static bool get_isConsolePlatform()
        if (Addr_isConsolePlatform!=0)
            LOG("[*] isConsolePlatform \t\t: "+
            (new NativeFunction(Addr_isConsolePlatform,'bool',[])()==1?"true":"false")+"\n"+line20,LogColor.C36)
    
        //public static bool get_isEditor()
        if (Addr_isEditor!=0)
            LOG("[*] isEditor \t\t\t: "+
            (new NativeFunction(Addr_isEditor,'bool',[])()==1?"true":"false")+"\n"+line20,LogColor.C36)
    
    
        //public static extern bool get_isPlaying();
        if (Addr_isPlaying !=0)
            LOG("[*] isPlaying \t\t\t: "+
            (new NativeFunction(Addr_isPlaying,'bool',[])()==1?"true":"false")+"\n"+line20,LogColor.C36)
        
        //public static float dpi() 
        if (Addr_dpi !=0)
            LOG("[*] dpi \t\t\t: "+
            new NativeFunction(Addr_dpi,'float',[])()+"\n"+line20,LogColor.C36)
    
        //public static extern int get_height()
        //public static extern int get_width()
        if (Addr_get_height != 0 && Addr_get_width != 0)
            LOG("[*] height*width \t\t: "+
            new NativeFunction(Addr_get_height,'int',[])()+"×"+
            new NativeFunction(Addr_get_width,'int',[])()+"\n"+line20,LogColor.C36)
    
        //public static ScreenOrientation get_orientation()
        if (Addr_get_orientation != 0){
            var value = new NativeFunction(Addr_get_orientation,'int',[])()
            switch (value){
                case 0:value = "Unknow" ; break
                case 1:value = "Portrait" ; break
                case 2:value = "PortraitUpsideDown" ; break
                case 3:value = "Landscape" ; break
                case 4:value = "LandscapeRight" ; break
                case 5:value = "AutoRotation" ; break
            }
            LOG("[*] ScreenOrientation \t\t: "+value,LogColor.C36)
        }
    
        //public static extern SystemLanguage get_systemLanguage()
        if (Addr_systemLanguage != 0){
            var value = new NativeFunction(Addr_systemLanguage,'int',[])()
            switch (value){
                case 6  : value = "Chinese" ; break
                case 40 : value = "ChineseSimplified" ; break
                case 41 : value = "ChineseTraditional" ; break
                case 10 : value = "English" ; break
                case 16 : value = "Japanese" ; break
                case 42 : value = "Unknown" ; break
                default : value = value;
            }
            LOG("[*] systemLanguage \t\t: "+value,LogColor.C36)
        }
    }
    
    function SystemInfo(){
        
        LOG("------------------- SystemInfo -------------------",LogColor.RED)
    
        var addr_get_deviceModel = find_method("UnityEngine.CoreModule","SystemInfo","get_deviceModel",0,true)
        var addr_get_deviceName = find_method("UnityEngine.CoreModule","SystemInfo","get_deviceName",0,true)
        var addr_get_deviceType = find_method("UnityEngine.CoreModule","SystemInfo","get_deviceType",0,true)
        var addr_get_deviceUniqueIdentifier = find_method("UnityEngine.CoreModule","SystemInfo","get_deviceUniqueIdentifier",0,true)
        var addr_get_graphicsDeviceID  = find_method("UnityEngine.CoreModule","SystemInfo","get_graphicsDeviceID",0,true)
        var addr_get_graphicsDeviceName = find_method("UnityEngine.CoreModule","SystemInfo","get_graphicsDeviceName",0,true)
        var addr_get_graphicsDeviceVersion = find_method("UnityEngine.CoreModule","SystemInfo","get_graphicsDeviceVersion",0,true)
        var addr_get_graphicsMemorySize = find_method("UnityEngine.CoreModule","SystemInfo","get_graphicsMemorySize",0,true)
        var addr_get_graphicsShaderLevel = find_method("UnityEngine.CoreModule","SystemInfo","get_graphicsShaderLevel",0,true)
        var addr_get_maxTextureSize = find_method("UnityEngine.CoreModule","SystemInfo","get_maxTextureSize",0,true)
        var addr_get_operatingSystem = find_method("UnityEngine.CoreModule","SystemInfo","get_operatingSystem",0,true)
        var addr_get_processorType = find_method("UnityEngine.CoreModule","SystemInfo","get_processorType",0,true)
        var addr_get_systemMemorySize = find_method("UnityEngine.CoreModule","SystemInfo","get_systemMemorySize",0,true)
        var addr_get_processorCount = find_method("UnityEngine.CoreModule","SystemInfo","get_processorCount",0,true)
        var addr_get_operatingSystemFamily = find_method("UnityEngine.CoreModule","SystemInfo","get_operatingSystemFamily",0,true)
    
        if (addr_get_deviceModel != 0)
            LOG("[*] deviceModel \t\t: "+ 
            new NativeFunction(addr_get_deviceModel,'pointer',[])()
            .add(p_size*3).readUtf16String()+"\n"+line20,LogColor.C36)
    
        if (addr_get_deviceName != 0)
            LOG("[*] deviceName \t\t\t: "+ 
            new NativeFunction(addr_get_deviceName,'pointer',[])()
            .add(p_size*3).readUtf16String()+"\n"+line20,LogColor.C36)
        
        if (addr_get_deviceType != 0)
            LOG("[*] deviceType \t\t\t: "+ 
            DeviceType(new NativeFunction(addr_get_deviceType,'int',[])())+"\n"+line20,LogColor.C36)
        
        if (addr_get_deviceUniqueIdentifier != 0)
            LOG("[*] deviceUniqueIdentifier \t: "+ 
            new NativeFunction(addr_get_deviceUniqueIdentifier,'pointer',[])()
            .add(p_size*3).readUtf16String()+"\n"+line20,LogColor.C36)
        
        if (addr_get_graphicsDeviceID != 0)
            LOG("[*] graphicsDeviceID \t\t: "+ 
            new NativeFunction(addr_get_graphicsDeviceID,'int',[])()+"\n"+line20,LogColor.C36)
        
        if (addr_get_graphicsDeviceName != 0)
            LOG("[*] graphicsDeviceName \t\t: "+ 
            new NativeFunction(addr_get_graphicsDeviceName,'pointer',[])()
            .add(p_size*3).readUtf16String()+"\n"+line20,LogColor.C36)
            
        if (addr_get_graphicsDeviceVersion != 0)
            LOG("[*] graphicsDeviceVersion \t: "+ 
            new NativeFunction(addr_get_graphicsDeviceVersion,'pointer',[])()
            .add(p_size*3).readUtf16String()+"\n"+line20,LogColor.C36)
        
        if (addr_get_graphicsShaderLevel != 0)
            LOG("[*] graphicsShaderLevel \t: "+ 
            new NativeFunction(addr_get_graphicsShaderLevel,'int',[])()+"\n"+line20,LogColor.C36)
            
        if (addr_get_graphicsMemorySize != 0)
            LOG("[*] graphicsMemorySize \t\t: "+ 
            new NativeFunction(addr_get_graphicsMemorySize,'int',[])()+"\n"+line20,LogColor.C36)
        
        if (addr_get_maxTextureSize != 0)
            LOG("[*] maxTextureSize \t\t: "+ 
            new NativeFunction(addr_get_maxTextureSize,'int',[])()+"\n"+line20,LogColor.C36)
        
        if (addr_get_operatingSystem != 0)
            LOG("[*] operatingSystem \t\t: "+ 
            new NativeFunction(addr_get_operatingSystem,'pointer',[])()
            .add(p_size*3).readUtf16String()+"\n"+line20,LogColor.C36)
    
        if (addr_get_processorType != 0)
            LOG("[*] processorType \t\t: "+ 
            new NativeFunction(addr_get_processorType,'pointer',[])()
            .add(p_size*3).readUtf16String()+"\n"+line20,LogColor.C36)
            
        if (addr_get_systemMemorySize != 0)
            LOG("[*] systemMemorySize \t\t: "+ 
            new NativeFunction(addr_get_systemMemorySize,'int',[])()+"\n"+line20,LogColor.C36)
        
        if (addr_get_processorCount != 0)
            LOG("[*] processorCount \t\t: "+ 
            new NativeFunction(addr_get_processorCount,'int',[])()+"\n"+line20,LogColor.C36)
    
        if (addr_get_operatingSystemFamily != 0)
            LOG("[*] operatingSystemFamily \t: "+ 
            operatingSystemFamily(new NativeFunction(addr_get_operatingSystemFamily,'int',[])())+"\n"+line20,LogColor.C36)
        
        function operatingSystemFamily(int_arg){
            switch(int_arg){
                case 0 : return "Other"
                case 1 : return "MaxOsX"
                case 2 : return "Windows"
                case 3 : return "Linux"
            }
        }
        
        function DeviceType(int_arg){
            switch(int_arg){
                case 0 : return "Unknown"
                case 1 : return "Handeld"
                case 2 : return "Desktop"
                case 3 : return "Console"
            }
        }
    }
}

function getApkInfo(){
    Java.perform(function(){

        LOG(getLine(100),LogColor.C33)

        var context = Java.use('android.app.ActivityThread').currentApplication().getApplicationContext()
        var pkgInfo = context.getPackageManager().getPackageInfo(context.getPackageName(), 0)
        // var appInfo = context.getApplicationInfo()
        var appInfo = pkgInfo.applicationInfo.value

        var labelRes = appInfo.labelRes.value
        var strName = context.getResources().getString(labelRes)
        LOG("[*]AppName\t\t"+strName + " (UID:"+appInfo.uid.value + ")\t ID:"+appInfo.labelRes.value,LogColor.C36)

        var str_pkgName = context.getPackageName()
        LOG("\n[*]PkgName\t\t"+str_pkgName,LogColor.C36)

        var verName = pkgInfo.versionName.value
        var targetSdkVersion = pkgInfo.applicationInfo.value.targetSdkVersion.value
        LOG("\n[*]Verison\t\t"+verName + " (targetSdkVersion:"+targetSdkVersion+")",LogColor.C36)

        var appSize = Java.use("java.io.File").$new(appInfo.sourceDir.value).length()
        LOG("\n[*]AppSize\t\t"+appSize +"\t("+(appSize/1024/1024).toFixed(2)+" MB)",LogColor.C36)

        LOG("\n[*]Time\t\t\tInstallTime\t" + new Date(pkgInfo.firstInstallTime.value).toLocaleString(),LogColor.C36)
        LOG("\t\t\tUpdateTime\t" + new Date(pkgInfo.lastUpdateTime.value).toLocaleString(),LogColor.C36)

        var ApkLocation = appInfo.sourceDir.value
        var TempFile = appInfo.dataDir.value
        LOG("\n[*]Location\t\t"+ApkLocation+"\n\t\t\t"+TempFile,LogColor.C36)

        //PackageManager.GET_SIGNATURES == 0x00000040
        var pis = context.getPackageManager().getPackageInfo(str_pkgName, 0x00000040)
        var hexDigist = (pis.signatures.value)[0].toByteArray()
        LOG("\n[*]Signatures\t\tMD5\t "+hexdigest(hexDigist,'MD5')
            +"\n\t\t\tSHA-1\t "+hexdigest(hexDigist,'SHA-1')
            +"\n\t\t\tSHA-256\t "+hexdigest(hexDigist,'SHA-256'),LogColor.C36)
        
        LOG(getLine(100),LogColor.C33)

        //LOG(getMetaData('unity.build-id'))
        function getMetaData(key){
            //public static final int GET_META_DATA = 0x00000080;
            var appInfo = context.getPackageManager().getApplicationInfo(context.getPackageName(), 0x00000080)
            var metaData = appInfo.metaData.value
            if(null != metaData) {
                // var metaDataB = Java.cast(metaData,Java.use("android.os.BaseBundle"))
                // LOG(metaDataB.mMap.value)
                return metaData.getString(key)
            }
            return null
        }

        /**
         * 计算byte字节并转换为String返回
         * @param {*} paramArrayOfByte byte 字节
         * @param {*} algorithm 算法 MD5 / SHA-1 / SHA-256
         */
        function hexdigest(paramArrayOfByte,algorithm){
            var hexDigits = [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 97, 98, 99, 100, 101, 102]
            var localMessageDigest = Java.use("java.security.MessageDigest").getInstance(algorithm)
            localMessageDigest.update(paramArrayOfByte)
            var arrayOfByte = localMessageDigest.digest()
            var arrayOfChar = []
            for (var i=0,j=0;;i++,j++){
                var strLenth = algorithm == "MD5" ? 16 : ( algorithm == "SHA-1" ? 20 : 32)
                if (i>=strLenth) return Java.use("java.lang.String").$new(arrayOfChar)
                var k = arrayOfByte[i]
                arrayOfChar[j] = hexDigits[(0xF & k >>> 4)]
                arrayOfChar[++j] = hexDigits[(k & 0xF)]
            }
        }
    })
}

function launchApp(pkgName){
    Java.perform(function(){
        var context = Java.use('android.app.ActivityThread').currentApplication().getApplicationContext()
        context.startActivity(Java.use("android.content.Intent").$new(context.getPackageManager().getLaunchIntentForPackage(pkgName)));
    })
}

/**
 * 读取c#字符串
 * @param {Number} mPtr c#字符串指针}
 */
function readU16(mPtr){
    return ptr(mPtr).add(p_size*2+4).readUtf16String()
}

/**
 * 生成cstring or c#string
 * @param {String} str 字符串
 * @param {*} type 随意填写 填写了就是C#String 不填写就是CString
 */
function allcStr(str,type){
    return type == undefined ? Memory.allocUtf8String(str) : il2cpp_string_new(Memory.allocUtf8String(str))
}

/**
 * 创建一个vector2/vector3/vector4
 * @param {Number} x 
 * @param {Number} y 
 * @param {Number} z 
 * @param {Number} w 
 */
function allcVector(x,y,z,w){
    var defaultV = 0
    var args = 2
    if (z != undefined){
        args = 3
        if (w !=undefined) 
            args = 4
    }
    var temp_vector = Memory.alloc(p_size*args)
    temp_vector.writeFloat(x==undefined?defaultV:x)
    temp_vector.add(p_size).writeFloat(y==undefined?defaultV:y)
    if (args >= 3)temp_vector.add(p_size*2).writeFloat(z)
    if (args == 4)temp_vector.add(p_size*3).writeFloat(w)
    return temp_vector
}

function seeHexR(addr,length){
    LOG(hexdump(ptr(soAddr.add(addr).readPointer()),{length:length}))
}

function seeHexA(addr,length){
    LOG(hexdump(ptr(addr),{length:length}))
}

function printCtx(pointer,range,sign){
    if (sign != undefined){
        for (var i = 0;i<range;i++){
            printLOG(pointer)
        }
        return
    }
    var max = range == undefined ? 5 : (range%2==1 ? (range + 1 ) : range) /2
    var min = range == undefined ? -4 : max - range
    for (var i = min;i<max;i++){
        printLOG(pointer)
    }

    function printLOG(pointer){
        var cur_p = ptr(pointer).add(p_size*i)
        LOG(cur_p+"\t"+cur_p.readPointer()+"\t"+Instruction.parse(cur_p),i==0?LogColor.RED:LogColor.WHITE)
    }
}

function LOG(str,type){
    if(!LogFlag) return
    if (type == undefined) {
        console.log(str)
        return
    }
    switch(type){
        case LogColor.WHITE     : console.log(str);                             break
        case LogColor.RED       : console.error(str);                           break
        case LogColor.YELLOW    : console.warn(str);                            break
        default                 : console.log("\x1b["+type+"m"+str+"\x1b[0m");  break
    }
}

function getLine(length){
    var retStr = ""
    for (var i=0;i<length;i++) {
        retStr += "-"
    }
    return retStr
}

function Toast(msg){
    Java.scheduleOnMainThread(function(){
        var context = Java.use('android.app.ActivityThread').currentApplication().getApplicationContext()
        Java.use("android.widget.Toast").makeText(context,Java.use("java.lang.String").$new(msg),1).show()
    })
}

function getLibPath(name){
    var retStr = ""
    Java.perform(function(){
        var context = Java.use('android.app.ActivityThread').currentApplication().getApplicationContext()
        var libPath = context.getApplicationInfo().nativeLibraryDir.value
        retStr =  libPath +"/"+ (name == undefined ? "" : name)
    })
    return retStr
}

/**
 * 配合HookOnPointerClick()，SetLocalScale()使用以达到动态隐藏gameobj
 * @param {Int} x 模拟点击的x位置
 * @param {Int} y 模拟点击的y位置
 */
function setClick(x,y){
    if (x == undefined || y == undefined) return
    Java.perform(function(){
        var Instrumentation = Java.use("android.app.Instrumentation")
        var SystemClock = Java.use("android.os.SystemClock")
        var MotionEvent = Java.use("android.view.MotionEvent")
        var inst = Instrumentation.$new()
        var downTime = SystemClock.uptimeMillis()
        var downEvent = MotionEvent.obtain(downTime,downTime,0,x,y,0)
        var upTime = SystemClock.uptimeMillis()
        var upEvent = MotionEvent.obtain(upTime,upTime,1,x,y,0)
        inst.sendPointerSync(downEvent)
        inst.sendPointerSync(upEvent)
    })
}

/**
 * 用来确定点击view的位置，配合上面这个函数使用 setClick() 以及 HookOnPointerClick() 使用
 * 启动游戏的时候进行模拟点击，配合HookOnPointerClick()即可确定gameobj，通过修改transform即可实现动态的隐藏一些按钮
 * 这里是针对一些bundle资源的u3d游戏，我们不能方便的去静态修改gameobj可见性,或者是一些其他原因我们不能修改，即可用这个动态修改的思路
 */
function HookMotionEvent(){
    Java.perform(function(){
        Java.use("android.view.View").onTouchEvent.implementation = function(event){
            var ret = this.onTouchEvent(event)
            LOG("\n"+getLine(25)+" onTouchEvent "+getLine(25),LogColor.YELLOW)
            LOG(ret+"\t"+event,LogColor.C36)
            return ret
        }

        Java.use("android.app.Activity").dispatchTouchEvent.implementation = function(event){
            var ret = this.dispatchTouchEvent(event)
            LOG("\n"+getLine(25)+" dispatchTouchEvent "+getLine(25),LogColor.YELLOW)
            LOG(ret+"\t"+event,LogColor.C36)
            return ret
        }
    })
}

/**
 * 隐藏模拟点击位置的gameobj
 * 这里find_method()在移植的时候写具体的地址就是，不用移植整个js代码
 * @param {*} x 
 * @param {*} y 
 */
function HideClickedObj(x,y){
    var m_ptr = find_method("UnityEngine.UI","Button","OnPointerClick",1)
    var srcFunc = new NativeFunction(m_ptr,'void',['pointer','pointer','pointer','pointer'])
    Interceptor.revert(m_ptr)
    Interceptor.replace(m_ptr,new NativeCallback(function(arg0,pointerEventData,arg2,arg3){
        srcFunc(arg0,pointerEventData,arg2,arg3)
        if (pointerEventData == 0) return 
        var f_get_pointerEnter = new NativeFunction(find_method("UnityEngine.UI","PointerEventData","get_pointerEnter",0),'pointer',['pointer'])
        var gameObj = f_get_pointerEnter(pointerEventData)
        //判断名字后使用这三种方式都可以去掉该对象
        if (getObjName(gameObj) == "Settings Button") {
            // setActive(gameObj,0)
            // var m_transform = new NativeFunction(find_method("UnityEngine.CoreModule","GameObject","get_transform",0),'pointer',['pointer'])(gameObj)
            // SetLocalScale(m_transform,0,0,0)
            destroyObj(gameObj)
        }
    },'void',['pointer','pointer','pointer','pointer']))

    setClick(x,y)
    //B 去断点找到点击事件的处理函数并nop掉
    //循环调用，出现时destory掉这个gameObj
}

function PrintStackTrace(){
    console.log("\x1b[36m"+
        Java.use("android.util.Log")
            .getStackTraceString(Java.use("java.lang.Throwable")
            .$new())+"\x1b[0m");
}

function PrintStackTraceN(ctx){
    console.log("\x1b[36m Called from:\n"+
            Thread.backtrace(ctx,Backtracer.FUZZY)
            .slice(0,6)
            // .reverse()
            .map(DebugSymbol.fromAddress).join("\n")+"\x1b[0m");
}

function SetInt(key,value){
    // var temp_size = 100
    // var header_size = Process.pointerSize*3
    // var str_header = new NativeFunction(cloudProjectIdAddr,'pointer',[])()
    // var temp_k = Memory.alloc(temp_size)
    // var tk = Memory.allocUtf16String(key)
    // Memory.copy(temp_k,str_header,header_size)
    // Memory.copy(temp_k.add(header_size),tk,temp_size - header_size)
    // new NativeFunction(Addr_SetInt,'void',['pointer','int'])(temp_k,value)

    new NativeFunction(find_method("UnityEngine.CoreModule","PlayerPrefs","SetInt",2,true),'void',['pointer','int'])(allcStr(key,""),value)
}

function SetFloat(key,value){
    new NativeFunction(find_method("UnityEngine.CoreModule","PlayerPrefs","SetFloat",2,true),'void',['pointer','float'])(allcStr(key,""),value)
}

function SetString(key,value){
    new NativeFunction(find_method("UnityEngine.CoreModule","PlayerPrefs","SetString",2,true),'void',['pointer','pointer'])(allcStr(key,""),allcStr(value,""))
}

function GetInt(key){
    var ret = new NativeFunction(find_method("UnityEngine.CoreModule","PlayerPrefs","GetInt",2,true),'pointer',['pointer','int'])(allcStr(key,""),0)
    LOG("\n[*] GetInt('"+key+"')\t--->\t"+ret.toInt32()+"\n",LogColor.C95)
}

function GetFloat(key){
    var ret = new NativeFunction(find_method("UnityEngine.CoreModule","PlayerPrefs","GetFloat",2,true),'pointer',['pointer','float'])(allcStr(key,""),0)
    LOG("\n[*] GetFloat('"+key+"')\t--->\t"+ret.toInt32()+"\n",LogColor.C95)
}

function GetString(key){
    var ret = new NativeFunction(find_method("UnityEngine.CoreModule","PlayerPrefs","GetString",1,true),'pointer',['pointer'])(allcStr(key,""))
    LOG("\n[*] GetString('"+key+"')\t--->\t"+readU16(ret)+"\n",LogColor.C95)
}

function SetLocalScale(mTransform,x,y,z){
    var set_localScale_Injected = find_method("UnityEngine.CoreModule","Transform","set_localScale_Injected",1,true)
    if (set_localScale_Injected ==0 ) return
    new NativeFunction(set_localScale_Injected,'pointer',['pointer','pointer'])(ptr(mTransform),allcVector(x,y,z))
}

function SetLocalPosition(mTransform,x,y,z){
    var set_localPosition_Injected = find_method("UnityEngine.CoreModule","Transform","set_localPosition_Injected",1,true)
    if (set_localPosition_Injected ==0 ) return
    new NativeFunction(set_localPosition_Injected,'pointer',['pointer','pointer'])(ptr(mTransform),allcVector(x,y,z))
}

function SetPosition(mTransform,x,y,z){
    var set_Position_Injected = find_method("UnityEngine.CoreModule","Transform","set_Position_Injected",1,true)
    if (set_Position_Injected ==0 ) return
    new NativeFunction(set_Position_Injected,'pointer',['pointer','pointer'])(ptr(mTransform),allcVector(x,y,z))
}

function SetLocalRotation(mTransform,x,y,z,w){
    // var set_Rotation_Injected = find_method("UnityEngine.CoreModule","Transform","set_Rotation_Injected",1,true)
    var set_localRotation_Injected = find_method("UnityEngine.CoreModule","Transform","set_localRotation_Injected",1,true)
    if (set_localRotation_Injected ==0 ) return
    new NativeFunction(set_localRotation_Injected,'pointer',['pointer','pointer'])(ptr(mTransform),allcVector(x,y,z,w))
}

/**
 * GameObject/Transform
 * @param {Pointer}  
 */
function getObjName(gameObj){
    return readU16(new NativeFunction(find_method("UnityEngine.CoreModule","Object","GetName",1,true),'pointer',['pointer'])(gameObj))
}

function showGameObject(gameObj){
    
    var f_getName        = new NativeFunction(find_method("UnityEngine.CoreModule","Object","GetName",1,true),'pointer',['pointer'])
    var f_getLayer       = new NativeFunction(find_method("UnityEngine.CoreModule","GameObject","get_layer",0,true),'int',['pointer'])
    var f_getTransform   = new NativeFunction(find_method("UnityEngine.CoreModule","GameObject","get_transform",0,true),'pointer',['pointer'])
    var f_getParent      = new NativeFunction(find_method("UnityEngine.CoreModule","Transform","GetParent",0,true),'pointer',['pointer'])
    // var f_getTag         = new NativeFunction(find_method("UnityEngine.CoreModule","GameObject","get_tag",0,true),'pointer',['pointer'])
    
    LOG("--------- GameObject ---------",LogColor.C33)
    LOG("gameObj\t\t--->\t"+gameObj,LogColor.C36)
    if (gameObj == 0) return
    LOG("getName\t\t--->\t"+getObjName(gameObj),LogColor.C36)
    LOG("getLayer\t--->\t"+f_getLayer(gameObj),LogColor.C36)           
    var m_transform = f_getTransform(gameObj)
    LOG("getTransform\t--->\t"+m_transform,LogColor.C36)
    // LOG("getTag\t\t--->\t"+f_getTag(gameObj).add(p_size*3).readUtf16String(),LogColor.C36)
    var debug = true
    var layerNames = ""
    for (var i=0;i<10;i++){
        var spl =  layerNames == "" ? "" : " <--- "
        layerNames = layerNames + spl + readU16(f_getName(m_transform)) + (debug?"("+m_transform+")":"")
        m_transform = f_getParent(m_transform)
        if (m_transform == 0) break
    }
    LOG("hierarchy\t--->\t"+layerNames,LogColor.C36)
}

function showTransform(transform){
    LOG("--------- Transform ---------",LogColor.C33)

    transform = ptr(transform)
    var addr_get_childCount = find_method("UnityEngine.CoreModule","Transform","get_childCount",0,true)
    
    if (addr_get_childCount != 0){
        var childCount = new NativeFunction(addr_get_childCount,'int',['pointer'])(transform)
        LOG("childCount\t--->\t"+childCount+"\t("+getObjName(transform)+")",LogColor.C36)
        PrintHierarchy(transform,2,true)
    }

    var addr_get_eulerAngles = find_method("UnityEngine.CoreModule","Transform","get_eulerAngles",0,true)
    if (addr_get_eulerAngles != 0){
        var f_get_eulerAngles = new NativeFunction(addr_get_eulerAngles,'pointer',['pointer','pointer'])
        var eulerAngles_vector3 = allcVector(0,0,0)
        f_get_eulerAngles(eulerAngles_vector3,transform)
        LOG("eulerAngles\t("+eulerAngles_vector3+")\t--->\t"+eulerAngles_vector3.readFloat()+"\t"+eulerAngles_vector3.add(p_size).readFloat()+"\t"+eulerAngles_vector3.add(p_size*2).readFloat(),LogColor.C36)
    }

    var addr_get_forward = find_method("UnityEngine.CoreModule","Transform","get_forward",0,true)
    if (addr_get_forward != 0){
        var f_get_forward = new NativeFunction(addr_get_forward,'pointer',['pointer','pointer'])
        var forward_vector3 = allcVector(0,0,0)
        f_get_forward(forward_vector3,transform)
        LOG("forward\t\t("+forward_vector3+")\t--->\t"+forward_vector3.readFloat()+"\t"+forward_vector3.add(p_size).readFloat()+"\t"+forward_vector3.add(p_size*2).readFloat(),LogColor.C36)
    }

    var addr_get_position = find_method("UnityEngine.CoreModule","Transform","get_position",0,true)
    if (addr_get_position != 0){
        var f_get_position = new NativeFunction(addr_get_position,'pointer',['pointer','pointer'])
        var Position_vector3 = allcVector(0,0,0)
        f_get_position(Position_vector3,transform)
        LOG("position\t("+Position_vector3+")\t--->\t"+Position_vector3.readFloat()+"\t"+Position_vector3.add(p_size).readFloat()+"\t"+Position_vector3.add(p_size*2).readFloat(),LogColor.C36)
    }

    var addr_get_localPosition = find_method("UnityEngine.CoreModule","Transform","get_localPosition",0,true)
    if (addr_get_localPosition != 0){
        var f_get_localPosition = new NativeFunction(addr_get_localPosition,'pointer',['pointer','pointer'])
        var localPosition_vector3 = allcVector(0,0,0)
        f_get_localPosition(localPosition_vector3,transform)
        LOG("localPosition\t("+localPosition_vector3+")\t--->\t"+localPosition_vector3.readFloat()+"\t"+localPosition_vector3.add(p_size).readFloat()+"\t"+localPosition_vector3.add(p_size*2).readFloat(),LogColor.C36)
    }
    
    var addr_get_localRotation = find_method("UnityEngine.CoreModule","Transform","get_localRotation",0,true)
    if (addr_get_localRotation != 0){
        var f_get_localRotation = new NativeFunction(addr_get_localRotation,'pointer',['pointer','pointer'])
        var localRotation_Quaternion = allcVector(0,0,0,0)
        f_get_localRotation(localRotation_Quaternion,transform)
        LOG("localRotation\t("+localRotation_Quaternion+")\t--->\t"+localRotation_Quaternion.readFloat()+"\t"+localRotation_Quaternion.add(p_size).readFloat()+"\t"+localRotation_Quaternion.add(p_size*2).readFloat()+"\t"+localRotation_Quaternion.add(p_size*3).readFloat(),LogColor.C36)
    }

    var addr_get_localScale = find_method("UnityEngine.CoreModule","Transform","get_localScale",0,true)
    if (addr_get_localScale != 0){
        var f_get_localScale = new NativeFunction(addr_get_localScale,'pointer',['pointer','pointer'])
        var localScale_vector3 = allcVector(0,0,0)
        f_get_localScale(localScale_vector3,transform)
        LOG("localScale\t("+localScale_vector3+")\t--->\t"+localScale_vector3.readFloat()+"\t"+localScale_vector3.add(p_size).readFloat()+"\t"+localScale_vector3.add(p_size*2).readFloat(),LogColor.C36)
    }

    var addr_get_lossyScale = find_method("UnityEngine.CoreModule","Transform","get_lossyScale",0,true)
    if (addr_get_lossyScale != 0){
        var f_get_lossyScale = new NativeFunction(addr_get_lossyScale,'pointer',['pointer','pointer'])
        var lossyScale_vector3 = allcVector(0,0,0)
        f_get_lossyScale(lossyScale_vector3,transform)
        LOG("lossyScale\t("+lossyScale_vector3+")\t--->\t"+lossyScale_vector3.readFloat()+"\t"+lossyScale_vector3.add(p_size).readFloat()+"\t"+lossyScale_vector3.add(p_size*2).readFloat(),LogColor.C36)
    }

    var addr_get_right = find_method("UnityEngine.CoreModule","Transform","get_right",0,true)
    if (addr_get_right != 0){
        var f_get_right = new NativeFunction(addr_get_right,'pointer',['pointer','pointer'])
        var right_vector3 = allcVector(0,0,0)
        f_get_right(right_vector3,transform)
        LOG("right\t\t("+right_vector3+")\t--->\t"+right_vector3.readFloat()+"\t"+right_vector3.add(p_size).readFloat()+"\t"+right_vector3.add(p_size*2).readFloat(),LogColor.C36)
    }

    var addr_get_up = find_method("UnityEngine.CoreModule","Transform","get_up",0,true)
    if (addr_get_up != 0){
        var f_get_up = new NativeFunction(addr_get_up,'pointer',['pointer','pointer'])
        var up_vector3 = allcVector(0,0,0)
        f_get_up(up_vector3,transform)
        LOG("up\t\t("+up_vector3+")\t--->\t"+up_vector3.readFloat()+"\t"+up_vector3.add(p_size).readFloat()+"\t"+up_vector3.add(p_size*2).readFloat(),LogColor.C36)
    }
    
    var addr_get_rotation = find_method("UnityEngine.CoreModule","Transform","get_rotation",0,true)
    if (addr_get_rotation != 0){
        var f_get_rotation = new NativeFunction(addr_get_rotation,'pointer',['pointer','pointer'])
        var rotation_Quaternion = allcVector(0,0,0,0)
        f_get_rotation(rotation_Quaternion,transform)
        LOG("rotation\t("+rotation_Quaternion+")\t--->\t"+rotation_Quaternion.readFloat()+"\t"+rotation_Quaternion.add(p_size).readFloat()+"\t"+rotation_Quaternion.add(p_size*2).readFloat()+"\t"+rotation_Quaternion.add(p_size*3).readFloat(),LogColor.C36)
    }
}

function showEventData(eventData){
    LOG("--------- EventData ---------",LogColor.C33)
    eventData = ptr(eventData) 
    var f_get_position = new NativeFunction(find_method("UnityEngine.UI","PointerEventData","get_position",0,true),'pointer',['pointer','pointer'])
    var click_vector2 = allcVector()
    f_get_position(click_vector2,eventData)
    LOG("ClickPositon\t--->\t"+click_vector2.readFloat()+"\t"+click_vector2.add(p_size).readFloat(),LogColor.C36)
    
    var f_get_clickTime = new NativeFunction(find_method("UnityEngine.UI","PointerEventData","get_clickTime",0,true),'float',['pointer'])
    LOG("clickTime\t--->\t"+f_get_clickTime(eventData),LogColor.C36)

    var f_get_clickCount = new NativeFunction(find_method("UnityEngine.UI","PointerEventData","get_clickCount",0,true),'int',['pointer'])
    LOG("clickCount\t--->\t"+f_get_clickCount(eventData),LogColor.C36)
    
    var f_get_delta = new NativeFunction(find_method("UnityEngine.UI","PointerEventData","get_delta",0,true),'pointer',['pointer','pointer'])
    var delta_vector2 = allcVector()
    f_get_delta(delta_vector2,eventData)
    LOG("delta\t\t--->\t"+delta_vector2.readFloat()+"\t"+delta_vector2.add(p_size).readFloat(),LogColor.C36)
    
    // 原UnityEngine.UI.PointerEventData.ToString
    // var f_toSting = new NativeFunction(find_method("UnityEngine.UI","PointerEventData","ToString",0,true),'pointer',['pointer'])
    // var s = f_toSting(PointerEventData)
    // LOG(s.add(p_size*3).readUtf16String())
}

function CallStatic(mPtr,arg0,arg1,arg2,arg3){
    arg0 = arg0 == undefined?ptr(0):arg0
    arg1 = arg1 == undefined?ptr(0):arg1
    arg2 = arg2 == undefined?ptr(0):arg2
    arg3 = arg3 == undefined?ptr(0):arg3
    new NativeFunction(mPtr,'pointer',['pointer','pointer','pointer','pointer'])(arg0,arg1,arg2,arg3)
}

/**
 * -------------------------------------------拓展方法-------------------------------------------------
 */

function GotoScene(str){
    CallStatic(find_method("UnityEngine.CoreModule","SceneManager","LoadScene",2)
        ,il2cpp_string_new(allcStr(str)))
} 

function setActive(gameObj,visible){
    new NativeFunction(find_method("UnityEngine.CoreModule","GameObject","SetActive",1,true),'pointer',['pointer','int'])(ptr(gameObj),visible)
}

function destroyObj(gameObj){
    new NativeFunction(find_method("UnityEngine.CoreModule","Object","Destroy",1,true),'pointer',['pointer'])(ptr(gameObj))
}

function HookSetActive(){
    Interceptor.attach(find_method("UnityEngine","GameObject","SetActive",1,true),{
        onEnter:function(args){
            //显示SetActive为true的项
            if (args[1].toInt32() == 1) {
                LOG("\n"+getLine(38),LogColor.YELLOW)
                LOG("public extern void SetActive( "+(args[1].toInt32()==0?"false":"true")+" );",LogColor.C36)
                LOG(getLine(20),LogColor.C33)
                showGameObject(args[0])
            }
            return 
            //显示SetActive为false的项
            if (args[1].toInt32() == 0) {
                LOG("\n"+getLine(38),LogColor.YELLOW)
                LOG("public extern void SetActive( "+(args[1].toInt32()==0?"false":"true")+" );",LogColor.C36)
                LOG(getLine(20),LogColor.C33)
                showGameObject(args[0])
            }
        },
        onLeave:function(retval){}
    })
}

function HookOnPointerClick(){

    var pointerEventData = null
    Interceptor.attach(find_method("UnityEngine.UI","Button","OnPointerClick",1),{
        onEnter:function(args){

            LOG("\n"+getLine(38),LogColor.YELLOW)
            LOG("public void OnPointerClick( "+(args[1])+" );",LogColor.C36)
            pointerEventData = args[1]
            if (pointerEventData == 0) return 
            
            var f_get_pointerEnter = new NativeFunction(find_method("UnityEngine.UI","PointerEventData","get_pointerEnter",0),'pointer',['pointer'])
            var gameObj = f_get_pointerEnter(pointerEventData)
            
            var f_getTransform   = new NativeFunction(find_method("UnityEngine.CoreModule","GameObject","get_transform",0),'pointer',['pointer'])
            var m_transform = f_getTransform(gameObj)

            showGameObject(gameObj)

            // showTransform(m_transform)

            // showEventData(pointerEventData)
        },
        onLeave:function(retval){

        } 
    })
    
    // HookProcessMoveDrag()

    //其他几个时机点
    function HookProcessMoveDrag(){

        HookHandlePointerExitAndEnter()
        move()
        drag()
        set_pointerPress()
        GetPointerData()

        
        function move(){
            Interceptor.attach(find_method("UnityEngine.UI","PointerInputModule","ProcessMove",1),{
                onEnter:function(args){
        
                    LOG("\n"+getLine(38),LogColor.YELLOW)
                    LOG("protected virtual Void ProcessMove( "+(args[1])+" );",LogColor.C36)
                    var pointerEventData = args[1]
                    
                    var f_get_pointerEnter = new NativeFunction(find_method("UnityEngine.UI","PointerEventData","get_pointerEnter",0),'pointer',['pointer'])
                    var gameObj = f_get_pointerEnter(pointerEventData)
                    
                    // var f_getTransform   = new NativeFunction(find_method("UnityEngine.CoreModule","GameObject","get_transform",0),'pointer',['pointer'])
                    // var m_transform = f_getTransform(gameObj)
        
                    showGameObject(gameObj)
        
                    // showTransform(m_transform)
        
                    // showEventData(pointerEventData)
                },
                onLeave:function(retval){
        
                } 
            })
        }
    
        function drag(){
            Interceptor.attach(find_method("UnityEngine.UI","PointerInputModule","ProcessDrag",1),{
                onEnter:function(args){
        
                    LOG("\n"+getLine(38),LogColor.YELLOW)
                    LOG("protected virtual Void ProcessDrag( "+(args[1])+" );",LogColor.C36)
                    var pointerEventData = args[1]
                    
                    var f_get_pointerEnter = new NativeFunction(find_method("UnityEngine.UI","PointerEventData","get_pointerDrag",0),'pointer',['pointer'])
                    var gameObj = f_get_pointerEnter(pointerEventData)
                    
                    // var f_getTransform   = new NativeFunction(find_method("UnityEngine.CoreModule","GameObject","get_transform",0),'pointer',['pointer'])
                    // var m_transform = f_getTransform(gameObj)
        
                    showGameObject(gameObj)
        
                    // showTransform(m_transform)
        
                    // showEventData(pointerEventData)
                },
                onLeave:function(retval){
        
                } 
            })
        }
    
        function HookHandlePointerExitAndEnter(){
            Interceptor.attach(find_method("UnityEngine.UI","BaseInputModule","HandlePointerExitAndEnter",2),{
                onEnter:function(args){
        
                    LOG("\n"+getLine(38),LogColor.YELLOW)
                    LOG("protected virtual Void HandlePointerExitAndEnter( "+(args[1])+" , "+(args[2])+")",LogColor.C36)
                    var pointerEventData = args[1]
                    
                    var f_get_pointerEnter = new NativeFunction(find_method("UnityEngine.UI","PointerEventData","get_pointerEnter",0),'pointer',['pointer'])
                    var gameObj = f_get_pointerEnter(pointerEventData)
                    
                    // var f_getTransform   = new NativeFunction(find_method("UnityEngine.CoreModule","GameObject","get_transform",0),'pointer',['pointer'])
                    // var m_transform = f_getTransform(gameObj)
        
                    showGameObject(args[2])
        
                    // showTransform(m_transform)
        
                    showEventData(pointerEventData)
                },
                onLeave:function(retval){
        
                } 
            })
        }
    
        function set_pointerPress(){
            Interceptor.attach(find_method("UnityEngine.UI","PointerEventData","set_pointerPress",1),{
                onEnter:function(args){
        
                    LOG("\n"+getLine(38),LogColor.YELLOW)
                    LOG("protected virtual Void set_pointerPress( "+(args[1])+" );",LogColor.C36)
                    
                    // var f_getTransform   = new NativeFunction(find_method("UnityEngine.CoreModule","GameObject","get_transform",0),'pointer',['pointer'])
                    // var m_transform = f_getTransform(gameObj)
        
                    showGameObject(args[1])
        
                    // showTransform(m_transform)
        
                    // showEventData(pointerEventData)
                },
                onLeave:function(retval){
        
                } 
            })
        }
    
        function GetPointerData(){
            Interceptor.attach(find_method("UnityEngine.UI","PointerInputModule","GetPointerData",3),{
                onEnter:function(args){
        
                    LOG("\n"+getLine(38),LogColor.YELLOW)
                    LOG("protected virtual Void set_pointerPress( "+(args[2])+" );",LogColor.C36)
                    
                    // var f_getTransform   = new NativeFunction(find_method("UnityEngine.CoreModule","GameObject","get_transform",0),'pointer',['pointer'])
                    // var m_transform = f_getTransform(gameObj)
        
                    showGameObject(args[1])
        
                    // showTransform(m_transform)
        
                    showEventData(args[2])
                },
                onLeave:function(retval){
        
                } 
            })
        }
    }
}

function HookPlayerPrefs(){

    var isShowPrintStack = false

    InterceptorGetFunctions()
    InterceptorSetFunctions()

    function InterceptorGetFunctions(){

        //public static extern float GetFloat(string key, float defaultValue)
        var Addr_GetFloat       = find_method("UnityEngine.CoreModule","PlayerPrefs","GetFloat",2,true)
        if (Addr_GetFloat !=0){
            Interceptor.attach(Addr_GetFloat,{
                onEnter:function(args){
                    this.arg0 = args[0]
                    this.arg1 = args[1]
                },
                onLeave:function(ret){
                    LOG("\n[*] '"+ret +"' = GetFloat('"+this.arg0.add(p_size*3).readUtf16String()+"',"+this.arg1+")",LogColor.C36)
                    if (isShowPrintStack) PrintStackTraceN(this.context)
                }
            })
        }
 
        //public static extern int GetInt(string key, int defaultValue)
        var Addr_GetInt         = find_method("UnityEngine.CoreModule","PlayerPrefs","GetInt",2,true)
        if (Addr_GetInt !=0){
            Interceptor.attach(Addr_GetInt,{
                onEnter:function(args){
                    this.arg0 = args[0]
                    this.arg1 = args[1]
                },
                onLeave:function(ret){
                    var s_arg0 = this.arg0.add(p_size*3).readUtf16String()
                    var i_arg1 = this.arg1
                    LOG("\n[*] '"+ret.toInt32() +"' = GetInt('"+s_arg0+"',"+i_arg1+")",LogColor.C36)
                    if (isShowPrintStack) PrintStackTraceN(this.context)
                    if (s_arg0.indexOf("SaleBoughted")!=-1) ret.replace(ptr(0x1))
                }
            })
        }
        
        //public static string GetString(string key)
        var Addr_GetString      = find_method("UnityEngine.CoreModule","PlayerPrefs","GetString",1,true)
        if (Addr_GetString !=0){
            Interceptor.attach(Addr_GetString,{
                onEnter:function(args){
                    this.arg0 = args[0]
                },
                onLeave:function(ret){
                    LOG("\n[*] '"+ret.add(p_size*3).readUtf16String()+"' = GetString('"+this.arg0.add(p_size*3).readUtf16String()+"')",LogColor.C36)
                    if (isShowPrintStack) PrintStackTraceN(this.context)
                }
            })
        }
    }

    function InterceptorSetFunctions(){

        //public static extern float GetFloat(string key, float defaultValue)
        var Addr_SetFloat       = find_method("UnityEngine.CoreModule","PlayerPrefs","SetFloat",2,true)
        if (Addr_SetFloat != 0){
            Interceptor.attach(Addr_SetFloat,{
                onEnter:function(args){
                    this.arg0 = args[0].add(p_size*3).readUtf16String()
                    this.arg1 = ( args[1] == 0 ? 0 : args[1].readFloat())
                },
                onLeave:function(ret){
                    LOG("\n[*] SetFloat('"+this.arg0+"',"+this.arg1+")",LogColor.C36)
                    if (isShowPrintStack) PrintStackTraceN(this.context)
                }
            })
        }
        
        //public static extern int GetInt(string key, int defaultValue)
        var Addr_SetInt         = find_method("UnityEngine.CoreModule","PlayerPrefs","SetInt",2,true)
        if (Addr_SetInt!=0){
            Interceptor.attach(Addr_SetInt,{
                onEnter:function(args){
                    this.arg0 = args[0].add(p_size*3).readUtf16String()
                    this.arg1 = args[1]
                },
                onLeave:function(ret){
                    LOG("\n[*] SetInt('"+this.arg0+"',"+this.arg1+")",LogColor.C36)
                    if (isShowPrintStack) PrintStackTraceN(this.context)
                }
            })
        }
        
        //public static string GetString(string key)
        var Addr_SetString      = find_method("UnityEngine.CoreModule","PlayerPrefs","SetString",2,true)
        if (Addr_SetString!=0){
            Interceptor.attach(Addr_SetString,{
                onEnter:function(args){
                    this.arg0 = args[0].add(p_size*3).readUtf16String()
                    this.arg1 = args[1].add(p_size*3).readUtf16String()
                },
                onLeave:function(ret){
                    LOG("\n[*] SetString('"+this.arg0+"','"+this.arg1+"')",LogColor.C36)
                    if (isShowPrintStack) PrintStackTraceN(this.context)
                }
            })
        }
    }
}

function HookDebugLog(){
    var addr_log_debug = find_method("UnityEngine.CoreModule","Debug","Log",1,true)
    if (addr_log_debug != 0){
        Interceptor.attach(addr_log_debug,{
            onEnter:function(args){
                LOG("\n[*] Debug.LOG('"+args[0].add(p_size*3).readUtf16String()+"')",LogColor.C36)
            },
            onLeave:function(ret){
    
            }
        })
    }

    var addr_log_logger = find_method("UnityEngine.CoreModule","Logger","Log",1,true)
    if (addr_log_logger != 0){
        Interceptor.attach(addr_log_logger,{
            onEnter:function(args){
                LOG("\n[*] Logger.LOG('"+args[0].add(p_size*3).readUtf16String()+"')",LogColor.C32)
            },
            onLeave:function(ret){
    
            }
        })
    }
}

function HookLoadScene(){
    var GetActiveScene = find_method("UnityEngine.CoreModule","SceneManager","GetActiveScene",0)
    if (current_scene != 0){
        var current_scene = new NativeFunction(GetActiveScene,'pointer',[])()
        var get_name = new NativeFunction(find_method("UnityEngine.CoreModule","Scene","GetNameInternal",1),'pointer',['int'])
        LOG("\nCurrentScene   --->   "+readU16(get_name(current_scene.toInt32()))+"\n",LogColor.C36)
    }

    Interceptor.attach(find_method("UnityEngine.CoreModule","SceneManager","LoadScene",2),{
        onEnter:function(args){
            LOG("\nCalled public static Scene LoadScene (String sceneName,LoadSceneParameters parameters)",LogColor.C36)
            LOG(" arg0  --->\t"+args[0]+"\t"+readU16(args[0]),LogColor.C36)
        }, 
        onLeave:function(ret){
            LOG(" ret  --->\t"+ret,LogColor.C36)
        }
    })
}

function HookGetSetText(){

    hookGet()
    hookSet()

    //动态替换文字
    var arr_src_str = ['Hold To Run','8082','免费获得','+400','暂停']
    var arr_rep_str = ['FuckMusic','-99','','-200²','pause']
    
    function hookSet(){
        var addr_set = find_method("UnityEngine.UI",'Text','set_text',1)
        if (addr_set != 0){
            Interceptor.attach(addr_set,{
                onEnter:function(args){
                    LOG("\n"+"called set_text("+args[1]+")\n["+ReadLength(args[1])+"]\t"+readU16(args[1]),LogColor.C33)
                    var newP = strReplace(args[1])
                    if (newP != 0) args[1] = newP
                },
                onLeave:function(ret){}
            })
        }
    }

    function hookGet(){
        var addr_get = find_method("UnityEngine.UI",'Text','get_text',0)
        if (addr_get != 0){
            Interceptor.attach(addr_get,{
                onEnter:function(args){},
                onLeave:function(ret){
                    LOG("\n"+"called "+ret+" = get_text()\n["+ReadLength(ret)+"]\t"+readU16(ret),LogColor.C32)
                    var newP = strReplace(ret)
                    if (newP != 0) ret.replace(newP)
                }
            })
        }
    }

    var memcmp = Module.findExportByName("libc.so","memcmp")
    if (memcmp!=0) memcmp = new NativeFunction(memcmp,'pointer',['pointer','pointer','int'])
    function strReplace(mPtr){
        if (mPtr==0 || memcmp==0 ||arr_src_str.length == 0 || arr_rep_str.length != arr_src_str.length ) return ptr(0)
        for (var i=0;i<arr_src_str.length;i++){
            if (memcmp(mPtr.add(p_size*2+4),allcStr(arr_src_str[i],"").add(p_size*2+4),ReadLength(mPtr)*2)==0) return allcStr(arr_rep_str[i],"")
        }
        return ptr(0)
    }

    function ReadLength(mPtr){
        return ptr(mPtr).add(Process.pointerSize*2).readPointer().toInt32()
    }

    //called : 0x792adc (0xaaf1d4d0)  --->    public Boolean get_hasBorder ()
    //called : 0x787e10 (0xb61477b0)  --->    public Int32 get_fontSize ()
    //called : 0x787e80 (0xb6147a18)  --->    public Boolean get_richText ()
    //called : 0x787eb0 (0xb6147b20)  --->    public Single get_lineSpacing ()
    //called : 0x787e20 (0xb6147808)  --->    public FontStyle get_fontStyle ()
}

/**
 * 打印transform往下的层级
 * ps:不建议打印底层的层级，展现一大篇出来毫无重点
 * @param {Number} mPtr Transform Pointer
 * @param {Number} level 最大显示层级
 * @param {Boolean} inCall 内部调用，去掉一些LOG
 */
function PrintHierarchy(mPtr,level,inCall){
    if (mPtr == 0 || mPtr == undefined) return
    if (level ==undefined) level = 10
    var transform = ptr(mPtr)
    
    var f_getName           = new NativeFunction(find_method("UnityEngine.CoreModule","Object","GetName",1),'pointer',['pointer'])
    var f_getParent         = new NativeFunction(find_method("UnityEngine.CoreModule","Transform","GetParent",0),'pointer',['pointer'])
    var f_getChildCount     = new NativeFunction(find_method("UnityEngine.CoreModule","Transform","get_childCount",0),'int',['pointer'])
    var f_getChild          = new NativeFunction(find_method("UnityEngine.CoreModule","Transform","GetChild",1),'pointer',['pointer','int'])

    if (level==10)LOG(getLine(73)+"\n",LogColor.C33)

    //当前level作为第一级
    var baseLevel = getLevel(transform)
    LOG((inCall!=undefined?"\t":"")+getSpace(0)+transform+" : "+ getObjName(transform),LogColor.C36)
    getChild(transform)

    if (level==10)LOG("\n"+getLine(73),LogColor.C33)
    
    //递归调用下层信息
    function getChild(p1){
        var childCount = f_getChildCount(p1)
        for (var i = 0;i<childCount;i++){
            var c_transform = f_getChild(p1,i)
            var levelC = getLevel(c_transform)-baseLevel
            if (levelC <= level) LOG((inCall!=undefined?"\t":"")+getSpace(levelC)+c_transform+" : "+ readU16(f_getName(c_transform)),LogColor.C36)
            getChild(c_transform)
        }
    }

    //判断当前transform的层级
    function getLevel(transform){
        for (var i=0;i<10;i++){
            try{
                transform = f_getParent(transform)
                if (transform ==0) return i
            }catch(e){
                return 0
            }
        }
        return 0 
    }

    //根据层级进行首行缩进
    function getSpace(length){
        var retStr = ''
        for (var i = 0;i<length;i++){
            retStr += '\t'
        }
        return retStr
    }
}

/**
 * 根据子Transform的名称来找父Transform的子Transform
 * 配合SetLocalScale()和HookSetActive()使用来动态的去掉页面上的view
 * 
 * Interceptor.attach(addrSetActive,{
        onEnter:function(args){
            if (args[1].toInt32() == 1) {
                LOG(getObjName(args[0])+"\tpublic extern void SetActive( "+(args[1].toInt32()==0?"false":"true")+" );")
                if (getObjName(args[0]) == "MainMenuScreen(Clone)"){
                    var trasform_par = f_getTransform(args[0])
                    var trasform_aim = ptr(findTransform(trasform_par,1,"Image"))
                    SetLocalScale(trasform_aim,0,0,0)
                }
                if (getObjName(args[0]) == "SettingsScreen(Clone)"){
                    var trasform_par = f_getTransform(args[0])
                    
                    var trasform_Language = ptr(findTransform(trasform_par,2,"Language"))
                    if (trasform_Language != null) SetLocalScale(trasform_Language,0,0,0)
                    
                    var trasform_Dropdown = ptr(findTransform(trasform_par,2,"Dropdown"))
                    if (trasform_Dropdown != null) SetLocalScale(trasform_Dropdown,0,0,0)
                }
            }
        },
        onLeave:function(retval){}
 */
function findTransform(mPtr,level,filter){
    if (mPtr == 0 || mPtr == undefined) return
    if (level ==undefined) level = 10
    var transform = ptr(mPtr)
    var retStr = ""
    
    var f_getName           = new NativeFunction(find_method("UnityEngine.CoreModule","Object","GetName",1),'pointer',['pointer'])
    var f_getParent         = new NativeFunction(find_method("UnityEngine.CoreModule","Transform","GetParent",0),'pointer',['pointer'])
    var f_getChildCount     = new NativeFunction(find_method("UnityEngine.CoreModule","Transform","get_childCount",0),'int',['pointer'])
    var f_getChild          = new NativeFunction(find_method("UnityEngine.CoreModule","Transform","GetChild",1),'pointer',['pointer','int'])

    var baseLevel = getLevel(transform)
    
    getChild(transform)

    function getChild(p1){
        var childCount = f_getChildCount(p1)
        for (var i = 0;i<childCount;i++){
            var c_transform = f_getChild(p1,i)
            var levelC = getLevel(c_transform)-baseLevel
            if (levelC <= level) {
                var name = readU16(f_getName(c_transform))
                // LOG(c_transform+" ---> "+name)
                if (filter == name){
                    retStr = c_transform
                }
            }
            getChild(c_transform)
        }
    }

    function getLevel(transform){
        for (var i=0;i<10;i++){
            try{
                transform = f_getParent(transform)
                if (transform ==0) return i
            }catch(e){
                return 0
            }
        }
        return 0 
    }
    return retStr
}
